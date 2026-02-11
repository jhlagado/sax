import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { Diagnostic } from '../diagnostics/types.js';
import { DiagnosticIds } from '../diagnostics/types.js';
import type { EmittedByteMap, SymbolEntry } from '../formats/types.js';
import type {
  AlignDirectiveNode,
  AsmItemNode,
  AsmInstructionNode,
  AsmOperandNode,
  BinDeclNode,
  DataBlockNode,
  DataDeclNode,
  EaExprNode,
  EnumDeclNode,
  ExternDeclNode,
  ExternFuncNode,
  FuncDeclNode,
  HexDeclNode,
  ImmExprNode,
  OpDeclNode,
  OpMatcherNode,
  ProgramNode,
  RecordFieldNode,
  SectionDirectiveNode,
  SourceSpan,
  TypeExprNode,
  VarBlockNode,
  VarDeclNode,
} from '../frontend/ast.js';
import type { CompileEnv } from '../semantics/env.js';
import { evalImmExpr } from '../semantics/env.js';
import { sizeOfTypeExpr } from '../semantics/layout.js';
import { encodeInstruction } from '../z80/encode.js';

function diag(diagnostics: Diagnostic[], file: string, message: string): void {
  diagnostics.push({ id: DiagnosticIds.EmitError, severity: 'error', message, file });
}

function diagAt(diagnostics: Diagnostic[], span: SourceSpan, message: string): void {
  diagnostics.push({
    id: DiagnosticIds.EmitError,
    severity: 'error',
    message,
    file: span.file,
    line: span.start.line,
    column: span.start.column,
  });
}

function warnAt(diagnostics: Diagnostic[], span: SourceSpan, message: string): void {
  diagnostics.push({
    id: DiagnosticIds.EmitError,
    severity: 'warning',
    message,
    file: span.file,
    line: span.start.line,
    column: span.start.column,
  });
}

/**
 * Emit machine-code bytes for a parsed program into an address->byte map.
 *
 * Implementation notes:
 * - Uses 3 independent section counters: `code`, `data`, `var`.
 * - `section` / `align` directives affect only the selected section counter.
 * - By default, `data` starts after `code` (aligned to 2), and `var` starts after `data` (aligned to 2),
 *   matching the earlier PR2 behavior.
 * - Detects overlapping byte emissions across all sections.
 */
export function emitProgram(
  program: ProgramNode,
  env: CompileEnv,
  diagnostics: Diagnostic[],
  options?: { includeDirs?: string[] },
): { map: EmittedByteMap; symbols: SymbolEntry[] } {
  type SectionKind = 'code' | 'data' | 'var';
  type PendingSymbol = {
    kind: 'label' | 'data' | 'var';
    name: string;
    section: SectionKind;
    offset: number;
    file?: string;
    line?: number;
    scope?: 'global' | 'local';
    size?: number;
  };

  const bytes = new Map<number, number>();
  const codeBytes = new Map<number, number>();
  const dataBytes = new Map<number, number>();
  const hexBytes = new Map<number, number>();
  const absoluteSymbols: SymbolEntry[] = [];
  const symbols: SymbolEntry[] = [];
  const pending: PendingSymbol[] = [];
  const taken = new Set<string>();
  const fixups: { offset: number; baseLower: string; addend: number; file: string }[] = [];
  const rel8Fixups: {
    offset: number;
    origin: number;
    baseLower: string;
    addend: number;
    file: string;
    mnemonic: string;
  }[] = [];
  const deferredExterns: {
    name: string;
    baseLower: string;
    addend: number;
    file: string;
    line: number;
  }[] = [];

  type Callable =
    | { kind: 'func'; node: FuncDeclNode }
    | { kind: 'extern'; node: ExternFuncNode; targetLower: string };
  const callables = new Map<string, Callable>();
  const opsByName = new Map<string, OpDeclNode[]>();
  const declaredOpNames = new Set<string>();
  const declaredBinNames = new Set<string>();

  const reg8 = new Set(['A', 'B', 'C', 'D', 'E', 'H', 'L']);
  const reg16 = new Set(['BC', 'DE', 'HL']);
  const reg8Code = new Map([
    ['B', 0],
    ['C', 1],
    ['D', 2],
    ['E', 3],
    ['H', 4],
    ['L', 5],
    ['A', 7],
  ]);

  const resolveScalarKind = (
    typeExpr: TypeExprNode,
    seen: Set<string> = new Set(),
  ): 'byte' | 'word' | 'addr' | undefined => {
    if (typeExpr.kind !== 'TypeName') return undefined;
    const lower = typeExpr.name.toLowerCase();
    if (lower === 'byte' || lower === 'word' || lower === 'addr') return lower;
    if (lower === 'ptr') return 'addr';
    if (seen.has(lower)) return undefined;
    seen.add(lower);
    const decl = env.types.get(typeExpr.name);
    if (!decl) return undefined;
    if (decl.kind !== 'TypeDecl') return undefined;
    return resolveScalarKind(decl.typeExpr, seen);
  };

  const storageTypes = new Map<string, TypeExprNode>();
  const stackSlotTypes = new Map<string, TypeExprNode>();
  const stackSlotOffsets = new Map<string, number>();
  let spDeltaTracked = 0;
  let spTrackingValid = true;
  let spTrackingInvalidatedByMutation = false;
  let generatedLabelCounter = 0;

  type EaResolution =
    | { kind: 'abs'; baseLower: string; addend: number; typeExpr?: TypeExprNode }
    | { kind: 'stack'; offsetFromStartSp: number; typeExpr?: TypeExprNode };

  const emitCodeBytes = (bs: Uint8Array, file: string) => {
    for (const b of bs) {
      codeBytes.set(codeOffset, b);
      codeOffset++;
    }
  };

  const applySpTracking = (headRaw: string, operands: AsmOperandNode[]) => {
    const head = headRaw.toLowerCase();
    if (
      head === 'ld' &&
      operands.length === 2 &&
      operands[0]?.kind === 'Reg' &&
      operands[0].name.toUpperCase() === 'SP'
    ) {
      spTrackingValid = false;
      spTrackingInvalidatedByMutation = true;
      return;
    }
    if (!spTrackingValid) return;
    if (head === 'push' && operands.length === 1) {
      spDeltaTracked -= 2;
      return;
    }
    if (head === 'pop' && operands.length === 1) {
      spDeltaTracked += 2;
      return;
    }
    if (
      head === 'inc' &&
      operands.length === 1 &&
      operands[0]?.kind === 'Reg' &&
      operands[0].name.toUpperCase() === 'SP'
    ) {
      spDeltaTracked += 1;
      return;
    }
    if (
      head === 'dec' &&
      operands.length === 1 &&
      operands[0]?.kind === 'Reg' &&
      operands[0].name.toUpperCase() === 'SP'
    ) {
      spDeltaTracked -= 1;
      return;
    }
  };

  const emitInstr = (head: string, operands: AsmOperandNode[], span: SourceSpan) => {
    const encoded = encodeInstruction(
      { kind: 'AsmInstruction', span, head, operands } as any,
      env,
      diagnostics,
    );
    if (!encoded) return false;
    emitCodeBytes(encoded, span.file);
    applySpTracking(head, operands);
    return true;
  };

  const pushImm16 = (n: number, span: any): boolean => {
    if (!loadImm16ToHL(n, span)) return false;
    return emitInstr('push', [{ kind: 'Reg', span, name: 'HL' }], span);
  };

  const loadImm16ToHL = (n: number, span: any): boolean => {
    return emitInstr(
      'ld',
      [
        { kind: 'Reg', span, name: 'HL' },
        { kind: 'Imm', span, expr: { kind: 'ImmLiteral', span, value: n } },
      ],
      span,
    );
  };

  const pushZeroExtendedReg8 = (r: string, span: any): boolean => {
    if (
      !emitInstr(
        'ld',
        [
          { kind: 'Reg', span, name: 'H' },
          { kind: 'Imm', span, expr: { kind: 'ImmLiteral', span, value: 0 } },
        ],
        span,
      )
    ) {
      return false;
    }
    if (
      !emitInstr(
        'ld',
        [
          { kind: 'Reg', span, name: 'L' },
          { kind: 'Reg', span, name: r },
        ],
        span,
      )
    ) {
      return false;
    }
    return emitInstr('push', [{ kind: 'Reg', span, name: 'HL' }], span);
  };

  const emitAbs16Fixup = (
    opcode: number,
    baseLower: string,
    addend: number,
    span: SourceSpan,
  ): void => {
    const start = codeOffset;
    codeBytes.set(codeOffset++, opcode);
    codeBytes.set(codeOffset++, 0x00);
    codeBytes.set(codeOffset++, 0x00);
    fixups.push({ offset: start + 1, baseLower, addend, file: span.file });
  };

  const emitAbs16FixupEd = (
    opcode2: number,
    baseLower: string,
    addend: number,
    span: SourceSpan,
  ): void => {
    const start = codeOffset;
    codeBytes.set(codeOffset++, 0xed);
    codeBytes.set(codeOffset++, opcode2);
    codeBytes.set(codeOffset++, 0x00);
    codeBytes.set(codeOffset++, 0x00);
    fixups.push({ offset: start + 2, baseLower, addend, file: span.file });
  };

  const emitAbs16FixupPrefixed = (
    prefix: number,
    opcode2: number,
    baseLower: string,
    addend: number,
    span: SourceSpan,
  ): void => {
    const start = codeOffset;
    codeBytes.set(codeOffset++, prefix);
    codeBytes.set(codeOffset++, opcode2);
    codeBytes.set(codeOffset++, 0x00);
    codeBytes.set(codeOffset++, 0x00);
    fixups.push({ offset: start + 2, baseLower, addend, file: span.file });
  };

  const emitRel8Fixup = (
    opcode: number,
    baseLower: string,
    addend: number,
    span: SourceSpan,
    mnemonic: string,
  ): void => {
    const start = codeOffset;
    codeBytes.set(codeOffset++, opcode);
    codeBytes.set(codeOffset++, 0x00);
    rel8Fixups.push({
      offset: start + 1,
      origin: start + 2,
      baseLower,
      addend,
      file: span.file,
      mnemonic,
    });
  };

  const conditionOpcodeFromName = (nameRaw: string): number | undefined => {
    const asName = nameRaw.toUpperCase();
    switch (asName) {
      case 'NZ':
        return 0xc2;
      case 'Z':
        return 0xca;
      case 'NC':
        return 0xd2;
      case 'C':
        return 0xda;
      case 'PO':
        return 0xe2;
      case 'PE':
        return 0xea;
      case 'P':
        return 0xf2;
      case 'M':
        return 0xfa;
      default:
        return undefined;
    }
  };
  const callConditionOpcodeFromName = (nameRaw: string): number | undefined => {
    switch (nameRaw.toUpperCase()) {
      case 'NZ':
        return 0xc4;
      case 'Z':
        return 0xcc;
      case 'NC':
        return 0xd4;
      case 'C':
        return 0xdc;
      case 'PO':
        return 0xe4;
      case 'PE':
        return 0xec;
      case 'P':
        return 0xf4;
      case 'M':
        return 0xfc;
      default:
        return undefined;
    }
  };

  const symbolicTargetFromExpr = (
    expr: ImmExprNode,
  ): { baseLower: string; addend: number } | undefined => {
    if (expr.kind === 'ImmName') return { baseLower: expr.name.toLowerCase(), addend: 0 };

    if (expr.kind !== 'ImmBinary') return undefined;
    if (expr.op !== '+' && expr.op !== '-') return undefined;

    const leftName = expr.left.kind === 'ImmName' ? expr.left.name.toLowerCase() : undefined;
    const rightName = expr.right.kind === 'ImmName' ? expr.right.name.toLowerCase() : undefined;

    if (leftName) {
      const right = evalImmExpr(expr.right, env, diagnostics);
      if (right === undefined) return undefined;
      const addend = expr.op === '+' ? right : -right;
      return { baseLower: leftName, addend };
    }

    if (expr.op === '+' && rightName) {
      const left = evalImmExpr(expr.left, env, diagnostics);
      if (left === undefined) return undefined;
      return { baseLower: rightName, addend: left };
    }

    return undefined;
  };
  const jrConditionOpcodeFromName = (nameRaw: string): number | undefined => {
    switch (nameRaw.toUpperCase()) {
      case 'NZ':
        return 0x20;
      case 'Z':
        return 0x28;
      case 'NC':
        return 0x30;
      case 'C':
        return 0x38;
      default:
        return undefined;
    }
  };

  const conditionOpcode = (op: AsmOperandNode): number | undefined => {
    const asName =
      op.kind === 'Imm' && op.expr.kind === 'ImmName'
        ? op.expr.name
        : op.kind === 'Reg'
          ? op.name
          : undefined;
    return asName ? conditionOpcodeFromName(asName) : undefined;
  };

  const inverseConditionName = (nameRaw: string): string | undefined => {
    const name = nameRaw.toUpperCase();
    switch (name) {
      case 'NZ':
        return 'Z';
      case 'Z':
        return 'NZ';
      case 'NC':
        return 'C';
      case 'C':
        return 'NC';
      case 'PO':
        return 'PE';
      case 'PE':
        return 'PO';
      case 'P':
        return 'M';
      case 'M':
        return 'P';
      default:
        return undefined;
    }
  };

  const normalizeFixedToken = (op: AsmOperandNode): string | undefined => {
    switch (op.kind) {
      case 'Reg':
        return op.name.toUpperCase();
      case 'Imm':
        if (op.expr.kind === 'ImmName') return op.expr.name.toUpperCase();
        return undefined;
      default:
        return undefined;
    }
  };

  const matcherMatchesOperand = (matcher: OpMatcherNode, operand: AsmOperandNode): boolean => {
    const evalImmNoDiag = (expr: ImmExprNode): number | undefined => {
      const scratch: Diagnostic[] = [];
      return evalImmExpr(expr, env, scratch);
    };
    const inferMemWidth = (op: AsmOperandNode): number | undefined => {
      if (op.kind !== 'Mem') return undefined;
      const resolved = resolveEa(op.expr, op.span);
      if (!resolved?.typeExpr) return undefined;
      return sizeOfTypeExpr(resolved.typeExpr, env, diagnostics);
    };

    switch (matcher.kind) {
      case 'MatcherReg8':
        return operand.kind === 'Reg' && reg8.has(operand.name.toUpperCase());
      case 'MatcherReg16':
        return (
          operand.kind === 'Reg' &&
          (operand.name.toUpperCase() === 'BC' ||
            operand.name.toUpperCase() === 'DE' ||
            operand.name.toUpperCase() === 'HL' ||
            operand.name.toUpperCase() === 'SP')
        );
      case 'MatcherImm8': {
        if (operand.kind !== 'Imm') return false;
        const v = evalImmNoDiag(operand.expr);
        return v !== undefined && v >= 0 && v <= 0xff;
      }
      case 'MatcherImm16': {
        if (operand.kind !== 'Imm') return false;
        const v = evalImmNoDiag(operand.expr);
        return v !== undefined && v >= 0 && v <= 0xffff;
      }
      case 'MatcherEa':
        return operand.kind === 'Ea';
      case 'MatcherMem8': {
        if (operand.kind !== 'Mem') return false;
        const width = inferMemWidth(operand);
        return width === undefined ? true : width === 1;
      }
      case 'MatcherMem16': {
        if (operand.kind !== 'Mem') return false;
        const width = inferMemWidth(operand);
        return width === undefined ? true : width === 2;
      }
      case 'MatcherFixed': {
        const got = normalizeFixedToken(operand);
        return got !== undefined && got === matcher.token.toUpperCase();
      }
      default:
        return false;
    }
  };

  const cloneImmExpr = (expr: ImmExprNode): ImmExprNode => {
    if (expr.kind === 'ImmLiteral') return { ...expr };
    if (expr.kind === 'ImmName') return { ...expr };
    if (expr.kind === 'ImmSizeof') return { ...expr };
    if (expr.kind === 'ImmUnary') return { ...expr, expr: cloneImmExpr(expr.expr) };
    return { ...expr, left: cloneImmExpr(expr.left), right: cloneImmExpr(expr.right) };
  };

  const cloneEaExpr = (ea: EaExprNode): EaExprNode => {
    switch (ea.kind) {
      case 'EaName':
        return { ...ea };
      case 'EaField':
        return { ...ea, base: cloneEaExpr(ea.base) };
      case 'EaIndex':
        return {
          ...ea,
          base: cloneEaExpr(ea.base),
          index:
            ea.index.kind === 'IndexEa'
              ? { ...ea.index, expr: cloneEaExpr(ea.index.expr) }
              : ea.index.kind === 'IndexImm'
                ? { ...ea.index, value: cloneImmExpr(ea.index.value) }
                : { ...ea.index },
        };
      case 'EaAdd':
      case 'EaSub':
        return { ...ea, base: cloneEaExpr(ea.base), offset: cloneImmExpr(ea.offset) };
    }
  };

  const cloneOperand = (op: AsmOperandNode): AsmOperandNode => {
    switch (op.kind) {
      case 'Reg':
      case 'PortC':
        return { ...op };
      case 'Imm':
      case 'PortImm8':
        return { ...op, expr: cloneImmExpr(op.expr) } as AsmOperandNode;
      case 'Ea':
      case 'Mem':
        return { ...op, expr: cloneEaExpr(op.expr) } as AsmOperandNode;
    }
  };

  type AggregateType = { kind: 'record' | 'union'; fields: RecordFieldNode[] };

  const resolveAggregateType = (te: TypeExprNode): AggregateType | undefined => {
    if (te.kind === 'RecordType') return { kind: 'record', fields: te.fields };
    if (te.kind === 'TypeName') {
      const decl = env.types.get(te.name);
      if (!decl) return undefined;
      if (decl.kind === 'UnionDecl') return { kind: 'union', fields: decl.fields };
      if (decl.typeExpr.kind === 'RecordType')
        return { kind: 'record', fields: decl.typeExpr.fields };
    }
    return undefined;
  };

  const resolveEa = (ea: EaExprNode, span: SourceSpan): EaResolution | undefined => {
    const go = (expr: EaExprNode): EaResolution | undefined => {
      switch (expr.kind) {
        case 'EaName': {
          const baseLower = expr.name.toLowerCase();
          const slotOff = stackSlotOffsets.get(baseLower);
          if (slotOff !== undefined) {
            const slotType = stackSlotTypes.get(baseLower);
            return {
              kind: 'stack',
              offsetFromStartSp: slotOff,
              ...(slotType ? { typeExpr: slotType } : {}),
            };
          }
          const typeExpr = storageTypes.get(baseLower);
          return { kind: 'abs', baseLower, addend: 0, ...(typeExpr ? { typeExpr } : {}) };
        }
        case 'EaAdd':
        case 'EaSub': {
          const base = go(expr.base);
          if (!base) return undefined;
          const v = evalImmExpr(expr.offset, env, diagnostics);
          if (v === undefined) {
            diagAt(diagnostics, span, `Failed to evaluate EA offset.`);
            return undefined;
          }
          const delta = expr.kind === 'EaAdd' ? v : -v;
          if (base.kind === 'abs') return { ...base, addend: base.addend + delta };
          return { ...base, offsetFromStartSp: base.offsetFromStartSp + delta };
        }
        case 'EaField': {
          const base = go(expr.base);
          if (!base) return undefined;
          if (!base.typeExpr) {
            diagAt(diagnostics, span, `Cannot resolve field "${expr.field}" without a typed base.`);
            return undefined;
          }
          const agg = resolveAggregateType(base.typeExpr);
          if (!agg) {
            diagAt(
              diagnostics,
              span,
              `Field access ".${expr.field}" requires a record or union type.`,
            );
            return undefined;
          }

          let off = 0;
          for (const f of agg.fields) {
            if (f.name === expr.field) {
              if (base.kind === 'abs') {
                return {
                  kind: 'abs',
                  baseLower: base.baseLower,
                  addend: base.addend + off,
                  typeExpr: f.typeExpr,
                };
              }
              return {
                kind: 'stack',
                offsetFromStartSp: base.offsetFromStartSp + off,
                typeExpr: f.typeExpr,
              };
            }
            if (agg.kind === 'record') {
              const sz = sizeOfTypeExpr(f.typeExpr, env, diagnostics);
              if (sz === undefined) return undefined;
              off += sz;
            }
          }
          const kind = agg.kind === 'union' ? 'union' : 'record';
          diagAt(diagnostics, span, `Unknown ${kind} field "${expr.field}".`);
          return undefined;
        }
        case 'EaIndex': {
          const base = go(expr.base);
          if (!base) return undefined;
          if (!base.typeExpr) {
            diagAt(diagnostics, span, `Cannot resolve indexing without a typed base.`);
            return undefined;
          }
          if (base.typeExpr.kind !== 'ArrayType') {
            diagAt(diagnostics, span, `Indexing requires an array type.`);
            return undefined;
          }
          if (expr.index.kind === 'IndexEa') {
            diagAt(diagnostics, span, `Nested indexed addresses are not supported yet.`);
            return undefined;
          }
          if (expr.index.kind !== 'IndexImm') return undefined;
          const idx = evalImmExpr(expr.index.value, env, diagnostics);
          if (idx === undefined) {
            diagAt(diagnostics, span, `Failed to evaluate array index.`);
            return undefined;
          }
          const elemSize = sizeOfTypeExpr(base.typeExpr.element, env, diagnostics);
          if (elemSize === undefined) return undefined;
          if (base.kind === 'abs') {
            return {
              kind: 'abs',
              baseLower: base.baseLower,
              addend: base.addend + idx * elemSize,
              typeExpr: base.typeExpr.element,
            };
          }
          return {
            kind: 'stack',
            offsetFromStartSp: base.offsetFromStartSp + idx * elemSize,
            typeExpr: base.typeExpr.element,
          };
        }
      }
    };

    return go(ea);
  };

  const pushEaAddress = (ea: EaExprNode, span: SourceSpan): boolean => {
    const r = resolveEa(ea, span);
    if (!r) {
      // Fallback: support `arr[reg8]` and `arr[HL]` (index byte read from memory at HL)
      // for element sizes 1 or 2, by computing the address into HL at runtime.
      if (ea.kind !== 'EaIndex') return false;
      const base = resolveEa(ea.base, span);
      if (!base || base.kind !== 'abs' || !base.typeExpr || base.typeExpr.kind !== 'ArrayType') {
        diagAt(diagnostics, span, `Unsupported ea argument: cannot lower indexed address.`);
        return false;
      }
      const elemSize = sizeOfTypeExpr(base.typeExpr.element, env, diagnostics);
      if (elemSize === undefined) return false;
      if (elemSize !== 1 && elemSize !== 2) {
        diagAt(
          diagnostics,
          span,
          `Non-constant indexing is supported only for element sizes 1 and 2 (got ${elemSize}).`,
        );
        return false;
      }
      if (ea.index.kind === 'IndexEa') {
        return false;
      }

      // If the index is sourced from (HL), read it before clobbering HL with the base address.
      if (ea.index.kind === 'IndexMemHL') {
        emitCodeBytes(Uint8Array.of(0x7e), span.file); // ld a, (hl)
      }

      emitAbs16Fixup(0x21, base.baseLower, base.addend, span); // ld hl, base

      if (ea.index.kind === 'IndexReg8') {
        const r8 = ea.index.reg.toUpperCase();
        if (!reg8.has(r8)) {
          diagAt(diagnostics, span, `Invalid reg8 index "${ea.index.reg}".`);
          return false;
        }
        if (elemSize === 2) {
          if (
            !emitInstr(
              'ld',
              [
                { kind: 'Reg', span, name: 'A' },
                { kind: 'Reg', span, name: r8 },
              ],
              span,
            )
          ) {
            return false;
          }
          emitCodeBytes(Uint8Array.of(0x87), span.file); // add a, a
          if (
            !emitInstr(
              'ld',
              [
                { kind: 'Reg', span, name: 'E' },
                { kind: 'Reg', span, name: 'A' },
              ],
              span,
            )
          ) {
            return false;
          }
        } else {
          if (
            !emitInstr(
              'ld',
              [
                { kind: 'Reg', span, name: 'E' },
                { kind: 'Reg', span, name: r8 },
              ],
              span,
            )
          ) {
            return false;
          }
        }
      } else if (ea.index.kind === 'IndexMemHL') {
        // Index already in A from `ld a,(hl)` above.
        if (elemSize === 2) {
          emitCodeBytes(Uint8Array.of(0x87), span.file); // add a, a
        }
        if (
          !emitInstr(
            'ld',
            [
              { kind: 'Reg', span, name: 'E' },
              { kind: 'Reg', span, name: 'A' },
            ],
            span,
          )
        ) {
          return false;
        }
      } else {
        diagAt(diagnostics, span, `Non-constant array indices are not supported yet.`);
        return false;
      }

      if (
        !emitInstr(
          'ld',
          [
            { kind: 'Reg', span, name: 'D' },
            { kind: 'Imm', span, expr: { kind: 'ImmLiteral', span, value: 0 } },
          ],
          span,
        )
      ) {
        return false;
      }
      if (
        !emitInstr(
          'add',
          [
            { kind: 'Reg', span, name: 'HL' },
            { kind: 'Reg', span, name: 'DE' },
          ],
          span,
        )
      ) {
        return false;
      }
      return emitInstr('push', [{ kind: 'Reg', span, name: 'HL' }], span);
    }
    if (r.kind === 'abs') {
      emitAbs16Fixup(0x21, r.baseLower, r.addend, span); // ld hl, nn
    } else {
      if (!spTrackingValid) {
        diagAt(diagnostics, span, `Cannot resolve stack slot after untracked SP mutation.`);
        return false;
      }
      const disp = (r.offsetFromStartSp - spDeltaTracked) & 0xffff;
      if (!loadImm16ToHL(disp, span)) return false;
      if (
        !emitInstr(
          'add',
          [
            { kind: 'Reg', span, name: 'HL' },
            { kind: 'Reg', span, name: 'SP' },
          ],
          span,
        )
      ) {
        return false;
      }
      return emitInstr('push', [{ kind: 'Reg', span, name: 'HL' }], span);
    }
    return emitInstr('push', [{ kind: 'Reg', span, name: 'HL' }], span);
  };

  const pushMemValue = (ea: EaExprNode, want: 'byte' | 'word', span: SourceSpan): boolean => {
    const r = resolveEa(ea, span);
    if (!r) return false;
    if (r.kind === 'abs') {
      if (want === 'word') {
        emitAbs16Fixup(0x2a, r.baseLower, r.addend, span); // ld hl, (nn)
        return emitInstr('push', [{ kind: 'Reg', span, name: 'HL' }], span);
      }
      emitAbs16Fixup(0x3a, r.baseLower, r.addend, span); // ld a, (nn)
      return pushZeroExtendedReg8('A', span);
    }

    if (!pushEaAddress(ea, span)) return false;
    if (!emitInstr('pop', [{ kind: 'Reg', span, name: 'HL' }], span)) return false;
    if (want === 'word') {
      // ld hl, (stack-ea via HL): ld a,(hl); inc hl; ld h,(hl); ld l,a
      emitCodeBytes(Uint8Array.of(0x7e), span.file);
      if (!emitInstr('inc', [{ kind: 'Reg', span, name: 'HL' }], span)) return false;
      emitCodeBytes(Uint8Array.of(0x66, 0x6f), span.file);
      return emitInstr('push', [{ kind: 'Reg', span, name: 'HL' }], span);
    }
    emitCodeBytes(Uint8Array.of(0x7e), span.file);
    return pushZeroExtendedReg8('A', span);
  };

  const materializeEaAddressToHL = (ea: EaExprNode, span: SourceSpan): boolean => {
    const r = resolveEa(ea, span);
    if (!r) {
      if (!pushEaAddress(ea, span)) return false;
      return emitInstr('pop', [{ kind: 'Reg', span, name: 'HL' }], span);
    }
    if (r.kind === 'abs') {
      emitAbs16Fixup(0x21, r.baseLower, r.addend, span); // ld hl, nn
      return true;
    }
    if (!spTrackingValid) {
      diagAt(diagnostics, span, `Cannot resolve stack slot after untracked SP mutation.`);
      return false;
    }
    const disp = (r.offsetFromStartSp - spDeltaTracked) & 0xffff;
    if (!loadImm16ToHL(disp, span)) return false;
    return emitInstr(
      'add',
      [
        { kind: 'Reg', span, name: 'HL' },
        { kind: 'Reg', span, name: 'SP' },
      ],
      span,
    );
  };

  const lowerLdWithEa = (inst: AsmInstructionNode): boolean => {
    if (inst.head.toLowerCase() !== 'ld' || inst.operands.length !== 2) return false;
    const dst = inst.operands[0]!;
    const src = inst.operands[1]!;
    const isEaNameHL = (ea: EaExprNode): boolean =>
      ea.kind === 'EaName' && ea.name.toUpperCase() === 'HL';
    const isEaNameBCorDE = (ea: EaExprNode): boolean =>
      ea.kind === 'EaName' && (ea.name.toUpperCase() === 'BC' || ea.name.toUpperCase() === 'DE');
    const isIxIyBaseEa = (ea: EaExprNode): boolean =>
      ea.kind === 'EaName' && (ea.name.toUpperCase() === 'IX' || ea.name.toUpperCase() === 'IY');
    const isIxIyDispMem = (op: AsmOperandNode): boolean =>
      op.kind === 'Mem' &&
      ((op.expr.kind === 'EaIndex' &&
        isIxIyBaseEa(op.expr.base) &&
        op.expr.index.kind === 'IndexImm') ||
        ((op.expr.kind === 'EaAdd' || op.expr.kind === 'EaSub') && isIxIyBaseEa(op.expr.base)));

    // LD r8, (ea)
    if (dst.kind === 'Reg' && src.kind === 'Mem') {
      if (isIxIyDispMem(src) && reg8Code.has(dst.name.toUpperCase())) return false; // let encoder handle (ix/iy+disp)
      if (isEaNameHL(src.expr)) return false; // let the encoder handle (hl)
      if (dst.name.toUpperCase() === 'A' && isEaNameBCorDE(src.expr)) return false; // ld a,(bc|de)
      if (dst.name.toUpperCase() === 'A') {
        const r = resolveEa(src.expr, inst.span);
        if (r?.kind === 'abs') {
          emitAbs16Fixup(0x3a, r.baseLower, r.addend, inst.span); // ld a, (nn)
          return true;
        }
      }
      const d = reg8Code.get(dst.name.toUpperCase());
      if (d !== undefined) {
        if (!materializeEaAddressToHL(src.expr, inst.span)) return false;
        emitCodeBytes(Uint8Array.of(0x46 + (d << 3)), inst.span.file);
        return true;
      }

      const r16 = dst.name.toUpperCase();
      if (r16 === 'HL') {
        const r = resolveEa(src.expr, inst.span);
        if (r?.kind === 'abs') {
          emitAbs16Fixup(0x2a, r.baseLower, r.addend, inst.span); // ld hl, (nn)
          return true;
        }
        if (!materializeEaAddressToHL(src.expr, inst.span)) return false;
        emitCodeBytes(Uint8Array.of(0x7e, 0x23, 0x66, 0x6f), inst.span.file);
        return true;
      }
      if (r16 === 'DE') {
        const r = resolveEa(src.expr, inst.span);
        if (r?.kind === 'abs') {
          emitAbs16FixupEd(0x5b, r.baseLower, r.addend, inst.span); // ld de, (nn)
          return true;
        }
        if (!materializeEaAddressToHL(src.expr, inst.span)) return false;
        emitCodeBytes(Uint8Array.of(0x7e, 0x23, 0x56, 0x5f), inst.span.file);
        return true;
      }
      if (r16 === 'BC') {
        const r = resolveEa(src.expr, inst.span);
        if (r?.kind === 'abs') {
          emitAbs16FixupEd(0x4b, r.baseLower, r.addend, inst.span); // ld bc, (nn)
          return true;
        }
        if (!materializeEaAddressToHL(src.expr, inst.span)) return false;
        emitCodeBytes(Uint8Array.of(0x7e, 0x23, 0x46, 0x4f), inst.span.file);
        return true;
      }
      if (r16 === 'SP') {
        const r = resolveEa(src.expr, inst.span);
        if (r?.kind === 'abs') {
          emitAbs16FixupEd(0x7b, r.baseLower, r.addend, inst.span); // ld sp, (nn)
          spTrackingValid = false;
          spTrackingInvalidatedByMutation = true;
          return true;
        }
      }
      if (r16 === 'IX' || r16 === 'IY') {
        const r = resolveEa(src.expr, inst.span);
        if (r?.kind === 'abs') {
          emitAbs16FixupPrefixed(
            r16 === 'IX' ? 0xdd : 0xfd,
            0x2a,
            r.baseLower,
            r.addend,
            inst.span,
          ); // ld ix/iy, (nn)
          return true;
        }
        if (!materializeEaAddressToHL(src.expr, inst.span)) return false;
        emitCodeBytes(Uint8Array.of(0x7e, 0x23, 0x66, 0x6f), inst.span.file);
        if (
          !emitInstr('push', [{ kind: 'Reg', span: inst.span, name: 'HL' }], inst.span) ||
          !emitInstr('pop', [{ kind: 'Reg', span: inst.span, name: r16 }], inst.span)
        ) {
          return false;
        }
        return true;
      }
    }

    // LD (ea), r8/r16
    if (dst.kind === 'Mem' && src.kind === 'Reg') {
      if (isIxIyDispMem(dst) && reg8Code.has(src.name.toUpperCase())) return false; // let encoder handle (ix/iy+disp)
      if (isEaNameHL(dst.expr)) return false; // let the encoder handle (hl)
      if (src.name.toUpperCase() === 'A' && isEaNameBCorDE(dst.expr)) return false; // ld (bc|de),a
      if (src.name.toUpperCase() === 'A') {
        const r = resolveEa(dst.expr, inst.span);
        if (r?.kind === 'abs') {
          emitAbs16Fixup(0x32, r.baseLower, r.addend, inst.span); // ld (nn), a
          return true;
        }
      }
      const s8 = reg8Code.get(src.name.toUpperCase());
      if (s8 !== undefined) {
        if (!materializeEaAddressToHL(dst.expr, inst.span)) return false;
        emitCodeBytes(Uint8Array.of(0x70 + s8), inst.span.file);
        return true;
      }

      const r16 = src.name.toUpperCase();
      if (r16 === 'HL') {
        const r = resolveEa(dst.expr, inst.span);
        if (r?.kind === 'abs') {
          emitAbs16Fixup(0x22, r.baseLower, r.addend, inst.span); // ld (nn), hl
          return true;
        }
        // Preserve HL value while materializing the destination address into HL.
        if (!emitInstr('push', [{ kind: 'Reg', span: inst.span, name: 'HL' }], inst.span))
          return false;
        if (!materializeEaAddressToHL(dst.expr, inst.span)) return false;
        if (!emitInstr('pop', [{ kind: 'Reg', span: inst.span, name: 'DE' }], inst.span))
          return false;
        emitCodeBytes(Uint8Array.of(0x73, 0x23, 0x72), inst.span.file);
        return true;
      }
      if (r16 === 'DE') {
        const r = resolveEa(dst.expr, inst.span);
        if (r?.kind === 'abs') {
          emitAbs16FixupEd(0x53, r.baseLower, r.addend, inst.span); // ld (nn), de
          return true;
        }
        if (!materializeEaAddressToHL(dst.expr, inst.span)) return false;
        emitCodeBytes(Uint8Array.of(0x73, 0x23, 0x72), inst.span.file);
        return true;
      }
      if (r16 === 'BC') {
        const r = resolveEa(dst.expr, inst.span);
        if (r?.kind === 'abs') {
          emitAbs16FixupEd(0x43, r.baseLower, r.addend, inst.span); // ld (nn), bc
          return true;
        }
        if (!materializeEaAddressToHL(dst.expr, inst.span)) return false;
        emitCodeBytes(Uint8Array.of(0x71, 0x23, 0x70), inst.span.file);
        return true;
      }
      if (r16 === 'SP') {
        const r = resolveEa(dst.expr, inst.span);
        if (r?.kind === 'abs') {
          emitAbs16FixupEd(0x73, r.baseLower, r.addend, inst.span); // ld (nn), sp
          return true;
        }
      }
      if (r16 === 'IX' || r16 === 'IY') {
        const r = resolveEa(dst.expr, inst.span);
        if (r?.kind === 'abs') {
          emitAbs16FixupPrefixed(
            r16 === 'IX' ? 0xdd : 0xfd,
            0x22,
            r.baseLower,
            r.addend,
            inst.span,
          ); // ld (nn), ix/iy
          return true;
        }
        if (
          !emitInstr('push', [{ kind: 'Reg', span: inst.span, name: r16 }], inst.span) ||
          !emitInstr('pop', [{ kind: 'Reg', span: inst.span, name: 'DE' }], inst.span)
        ) {
          return false;
        }
        if (!materializeEaAddressToHL(dst.expr, inst.span)) return false;
        emitCodeBytes(Uint8Array.of(0x73, 0x23, 0x72), inst.span.file);
        return true;
      }
    }

    // LD (ea), imm (imm8 for byte, imm16 for word/addr)
    if (dst.kind === 'Mem' && src.kind === 'Imm') {
      if (isIxIyDispMem(dst)) return false; // let the encoder handle (ix/iy+disp), imm8
      if (isEaNameHL(dst.expr)) return false; // let the encoder handle (hl)
      const resolved = resolveEa(dst.expr, inst.span);
      const scalar =
        resolved?.typeExpr !== undefined
          ? resolveScalarKind(resolved.typeExpr, new Set())
          : undefined;
      const v = evalImmExpr(src.expr, env, diagnostics);
      if (v === undefined) {
        diagAt(diagnostics, inst.span, `ld (ea), imm expects a constant imm expression.`);
        return true;
      }

      if (scalar === 'byte') {
        if (v < 0 || v > 0xff) {
          diagAt(diagnostics, inst.span, `ld (ea), imm expects imm8.`);
          return true;
        }
        if (!materializeEaAddressToHL(dst.expr, inst.span)) return true;
        return emitInstr(
          'ld',
          [
            { kind: 'Mem', span: inst.span, expr: { kind: 'EaName', span: inst.span, name: 'HL' } },
            {
              kind: 'Imm',
              span: inst.span,
              expr: { kind: 'ImmLiteral', span: inst.span, value: v },
            },
          ],
          inst.span,
        );
      }

      if (scalar === 'word' || scalar === 'addr') {
        if (v < 0 || v > 0xffff) {
          diagAt(diagnostics, inst.span, `ld (ea), imm expects imm16.`);
          return true;
        }
        const r = resolveEa(dst.expr, inst.span);
        if (r?.kind === 'abs') {
          // Fast path for absolute EA: store via `ld (nn), hl` after loading HL with the immediate.
          // This is smaller than emitting two separate byte stores.
          if (!loadImm16ToHL(v, inst.span)) return true;
          emitAbs16Fixup(0x22, r.baseLower, r.addend, inst.span); // ld (nn), hl
          return true;
        }
        if (!materializeEaAddressToHL(dst.expr, inst.span)) return true;
        const lo = v & 0xff;
        const hi = (v >> 8) & 0xff;
        if (
          !emitInstr(
            'ld',
            [
              {
                kind: 'Mem',
                span: inst.span,
                expr: { kind: 'EaName', span: inst.span, name: 'HL' },
              },
              {
                kind: 'Imm',
                span: inst.span,
                expr: { kind: 'ImmLiteral', span: inst.span, value: lo },
              },
            ],
            inst.span,
          )
        ) {
          return true;
        }
        if (!emitInstr('inc', [{ kind: 'Reg', span: inst.span, name: 'HL' }], inst.span))
          return true;
        return emitInstr(
          'ld',
          [
            { kind: 'Mem', span: inst.span, expr: { kind: 'EaName', span: inst.span, name: 'HL' } },
            {
              kind: 'Imm',
              span: inst.span,
              expr: { kind: 'ImmLiteral', span: inst.span, value: hi },
            },
          ],
          inst.span,
        );
      }

      diagAt(
        diagnostics,
        inst.span,
        `ld (ea), imm is supported only for byte/word/addr destinations.`,
      );
      return true;
    }

    return false;
  };

  const firstModule = program.files[0];
  if (!firstModule) {
    diag(diagnostics, program.entryFile, 'No module files to compile.');
    return { map: { bytes }, symbols };
  }

  const primaryFile = firstModule.span.file ?? program.entryFile;
  const includeDirs = (options?.includeDirs ?? []).map((p) => resolve(p));

  const alignTo = (n: number, a: number) => (a <= 0 ? n : Math.ceil(n / a) * a);

  const resolveInputPath = (fromFile: string, fromPath: string): string | undefined => {
    const candidates: string[] = [];
    candidates.push(resolve(dirname(fromFile), fromPath));
    for (const inc of includeDirs) candidates.push(resolve(inc, fromPath));
    const seen = new Set<string>();
    for (const c of candidates) {
      if (seen.has(c)) continue;
      seen.add(c);
      if (existsSync(c)) return c;
    }
    diag(diagnostics, fromFile, `Failed to resolve input path "${fromPath}".`);
    return undefined;
  };

  const parseIntelHex = (
    ownerFile: string,
    hexText: string,
  ): { bytes: Map<number, number>; minAddress: number } | undefined => {
    const out = new Map<number, number>();
    let minAddress = Number.POSITIVE_INFINITY;
    const lines = hexText.split(/\r?\n/);
    let sawData = false;
    let sawEof = false;

    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
      const raw = lines[lineIndex]!.trim();
      if (raw.length === 0) continue;
      if (!raw.startsWith(':')) {
        diag(diagnostics, ownerFile, `Invalid Intel HEX record at line ${lineIndex + 1}.`);
        return undefined;
      }
      const body = raw.slice(1);
      if (body.length < 10 || body.length % 2 !== 0) {
        diag(diagnostics, ownerFile, `Malformed Intel HEX record at line ${lineIndex + 1}.`);
        return undefined;
      }
      const bytesLine: number[] = [];
      for (let i = 0; i < body.length; i += 2) {
        const pair = body.slice(i, i + 2);
        const value = Number.parseInt(pair, 16);
        if (Number.isNaN(value)) {
          diag(diagnostics, ownerFile, `Invalid HEX byte "${pair}" at line ${lineIndex + 1}.`);
          return undefined;
        }
        bytesLine.push(value & 0xff);
      }

      const len = bytesLine[0]!;
      const addr = ((bytesLine[1]! << 8) | bytesLine[2]!) & 0xffff;
      const type = bytesLine[3]!;
      const data = bytesLine.slice(4, bytesLine.length - 1);
      const checksum = bytesLine[bytesLine.length - 1]!;
      if (len !== data.length) {
        diag(diagnostics, ownerFile, `Intel HEX length mismatch at line ${lineIndex + 1}.`);
        return undefined;
      }
      const sum = bytesLine.reduce((acc, b) => (acc + b) & 0xff, 0);
      if (sum !== 0) {
        diag(diagnostics, ownerFile, `Intel HEX checksum mismatch at line ${lineIndex + 1}.`);
        return undefined;
      }
      if (sawEof) {
        diag(diagnostics, ownerFile, `Intel HEX data found after EOF record.`);
        return undefined;
      }

      if (type === 0x00) {
        for (let i = 0; i < data.length; i++) {
          const address = addr + i;
          if (address < 0 || address > 0xffff) {
            diag(
              diagnostics,
              ownerFile,
              `Intel HEX address out of range at line ${lineIndex + 1}.`,
            );
            return undefined;
          }
          if (out.has(address)) {
            diag(diagnostics, ownerFile, `Intel HEX overlaps itself at address ${address}.`);
            return undefined;
          }
          out.set(address, data[i]!);
          minAddress = Math.min(minAddress, address);
        }
        sawData = true;
        continue;
      }

      if (type === 0x01) {
        sawEof = true;
        continue;
      }

      diag(
        diagnostics,
        ownerFile,
        `Unsupported Intel HEX record type ${type.toString(16).padStart(2, '0')} at line ${lineIndex + 1}.`,
      );
      return undefined;
    }

    if (!sawData) {
      diag(diagnostics, ownerFile, `Intel HEX file has no data records.`);
      return undefined;
    }

    return { bytes: out, minAddress };
  };

  // Pre-scan callables for resolution (forward references allowed).
  for (const module of program.files) {
    for (const item of module.items) {
      if (item.kind === 'FuncDecl') {
        const f = item as FuncDeclNode;
        callables.set(f.name.toLowerCase(), { kind: 'func', node: f });
      } else if (item.kind === 'OpDecl') {
        const op = item as OpDeclNode;
        const key = op.name.toLowerCase();
        const existing = opsByName.get(key);
        if (existing) existing.push(op);
        else opsByName.set(key, [op]);
      } else if (item.kind === 'ExternDecl') {
        const ex = item as ExternDeclNode;
        for (const fn of ex.funcs) {
          callables.set(fn.name.toLowerCase(), {
            kind: 'extern',
            node: fn,
            targetLower: fn.name.toLowerCase(),
          });
        }
      } else if (item.kind === 'VarBlock' && item.scope === 'module') {
        const vb = item as VarBlockNode;
        for (const decl of vb.decls) {
          storageTypes.set(decl.name.toLowerCase(), decl.typeExpr);
        }
      } else if (item.kind === 'BinDecl') {
        const bd = item as BinDeclNode;
        declaredBinNames.add(bd.name.toLowerCase());
        storageTypes.set(bd.name.toLowerCase(), { kind: 'TypeName', span: bd.span, name: 'addr' });
      } else if (item.kind === 'HexDecl') {
        const hd = item as HexDeclNode;
        storageTypes.set(hd.name.toLowerCase(), { kind: 'TypeName', span: hd.span, name: 'addr' });
      } else if (item.kind === 'DataBlock') {
        const db = item as DataBlockNode;
        for (const decl of db.decls) {
          storageTypes.set(decl.name.toLowerCase(), decl.typeExpr);
        }
      }
    }
  }

  let activeSection: SectionKind = 'code';
  let codeOffset = 0;
  let dataOffset = 0;
  let varOffset = 0;

  const baseExprs: Partial<Record<SectionKind, SectionDirectiveNode['at']>> = {};

  const setBaseExpr = (kind: SectionKind, at: SectionDirectiveNode['at'], file: string) => {
    if (baseExprs[kind]) {
      diag(diagnostics, file, `Section "${kind}" base address may be set at most once.`);
      return;
    }
    baseExprs[kind] = at;
  };

  const advanceAlign = (a: number) => {
    switch (activeSection) {
      case 'code':
        codeOffset = alignTo(codeOffset, a);
        return;
      case 'data':
        dataOffset = alignTo(dataOffset, a);
        return;
      case 'var':
        varOffset = alignTo(varOffset, a);
        return;
    }
  };

  for (const module of program.files) {
    activeSection = 'code';

    for (const item of module.items) {
      if (item.kind === 'ConstDecl') {
        const v = env.consts.get(item.name);
        if (v !== undefined) {
          if (taken.has(item.name)) {
            diag(diagnostics, item.span.file, `Duplicate symbol name "${item.name}".`);
            continue;
          }
          taken.add(item.name);
          symbols.push({
            kind: 'constant',
            name: item.name,
            value: v,
            address: v,
            file: item.span.file,
            line: item.span.start.line,
            scope: 'global',
          });
        }
        continue;
      }

      if (item.kind === 'EnumDecl') {
        const e = item as EnumDeclNode;
        for (let idx = 0; idx < e.members.length; idx++) {
          const name = e.members[idx]!;
          if (env.enums.get(name) !== idx) continue;
          if (taken.has(name)) {
            diag(diagnostics, e.span.file, `Duplicate symbol name "${name}".`);
            continue;
          }
          taken.add(name);
          symbols.push({
            kind: 'constant',
            name,
            value: idx,
            address: idx,
            file: e.span.file,
            line: e.span.start.line,
            scope: 'global',
          });
        }
        continue;
      }

      if (item.kind === 'Section') {
        const s = item as SectionDirectiveNode;
        activeSection = s.section;
        if (s.at) setBaseExpr(s.section, s.at, s.span.file);
        continue;
      }

      if (item.kind === 'Align') {
        const a = item as AlignDirectiveNode;
        const v = evalImmExpr(a.value, env, diagnostics);
        if (v === undefined) {
          diag(diagnostics, a.span.file, `Failed to evaluate align value.`);
          continue;
        }
        if (v <= 0) {
          diag(diagnostics, a.span.file, `align value must be > 0.`);
          continue;
        }
        advanceAlign(v);
        continue;
      }

      if (item.kind === 'ExternDecl') {
        const ex = item as ExternDeclNode;
        const baseLower = ex.base?.toLowerCase();
        if (baseLower !== undefined && !declaredBinNames.has(baseLower)) {
          diag(
            diagnostics,
            ex.span.file,
            `extern base "${ex.base}" does not reference a declared bin symbol.`,
          );
          continue;
        }
        for (const fn of ex.funcs) {
          if (taken.has(fn.name)) {
            diag(diagnostics, fn.span.file, `Duplicate symbol name "${fn.name}".`);
            continue;
          }
          taken.add(fn.name);
          if (baseLower !== undefined) {
            const offset = evalImmExpr(fn.at, env, diagnostics);
            if (offset === undefined) {
              diag(
                diagnostics,
                fn.span.file,
                `Failed to evaluate extern func offset for "${fn.name}".`,
              );
              continue;
            }
            if (offset < 0 || offset > 0xffff) {
              diag(
                diagnostics,
                fn.span.file,
                `extern func "${fn.name}" offset out of range (0..65535).`,
              );
              continue;
            }
            deferredExterns.push({
              name: fn.name,
              baseLower,
              addend: offset,
              file: fn.span.file,
              line: fn.span.start.line,
            });
            continue;
          }

          const addr = evalImmExpr(fn.at, env, diagnostics);
          if (addr === undefined) {
            diag(
              diagnostics,
              fn.span.file,
              `Failed to evaluate extern func address for "${fn.name}".`,
            );
            continue;
          }
          if (addr < 0 || addr > 0xffff) {
            diag(
              diagnostics,
              fn.span.file,
              `extern func "${fn.name}" address out of range (0..65535).`,
            );
            continue;
          }
          symbols.push({
            kind: 'label',
            name: fn.name,
            address: addr,
            file: fn.span.file,
            line: fn.span.start.line,
            scope: 'global',
          });
        }
        continue;
      }

      if (item.kind === 'BinDecl') {
        const binDecl = item as BinDeclNode;
        if (taken.has(binDecl.name)) {
          diag(diagnostics, binDecl.span.file, `Duplicate symbol name "${binDecl.name}".`);
          continue;
        }
        taken.add(binDecl.name);

        const path = resolveInputPath(binDecl.span.file, binDecl.fromPath);
        if (!path) continue;

        let blob: Buffer;
        try {
          blob = readFileSync(path);
        } catch (err) {
          diag(diagnostics, binDecl.span.file, `Failed to read bin file "${path}": ${String(err)}`);
          continue;
        }

        if (binDecl.section === 'var') {
          diag(
            diagnostics,
            binDecl.span.file,
            `bin declarations cannot target section "var" in current subset.`,
          );
          continue;
        }

        if (binDecl.section === 'code') {
          pending.push({
            kind: 'data',
            name: binDecl.name,
            section: 'code',
            offset: codeOffset,
            file: binDecl.span.file,
            line: binDecl.span.start.line,
            scope: 'global',
          });
          for (const b of blob) codeBytes.set(codeOffset++, b & 0xff);
        } else {
          pending.push({
            kind: 'data',
            name: binDecl.name,
            section: 'data',
            offset: dataOffset,
            file: binDecl.span.file,
            line: binDecl.span.start.line,
            scope: 'global',
          });
          for (const b of blob) dataBytes.set(dataOffset++, b & 0xff);
        }
        continue;
      }

      if (item.kind === 'HexDecl') {
        const hexDecl = item as HexDeclNode;
        if (taken.has(hexDecl.name)) {
          diag(diagnostics, hexDecl.span.file, `Duplicate symbol name "${hexDecl.name}".`);
          continue;
        }
        taken.add(hexDecl.name);

        const path = resolveInputPath(hexDecl.span.file, hexDecl.fromPath);
        if (!path) continue;

        let text: string;
        try {
          text = readFileSync(path, 'utf8');
        } catch (err) {
          diag(diagnostics, hexDecl.span.file, `Failed to read hex file "${path}": ${String(err)}`);
          continue;
        }

        const parsed = parseIntelHex(hexDecl.span.file, text);
        if (!parsed) continue;

        for (const [addr, b] of parsed.bytes) {
          if (hexBytes.has(addr)) {
            diag(diagnostics, hexDecl.span.file, `HEX overlap at address ${addr}.`);
            continue;
          }
          hexBytes.set(addr, b);
        }
        absoluteSymbols.push({
          kind: 'data',
          name: hexDecl.name,
          address: parsed.minAddress,
          file: hexDecl.span.file,
          line: hexDecl.span.start.line,
          scope: 'global',
        });
        continue;
      }

      if (item.kind === 'OpDecl') {
        const op = item as OpDeclNode;
        const key = op.name.toLowerCase();
        if (taken.has(op.name) && !declaredOpNames.has(key)) {
          diag(diagnostics, op.span.file, `Duplicate symbol name "${op.name}".`);
        } else {
          taken.add(op.name);
          declaredOpNames.add(key);
        }
        continue;
      }

      if (item.kind === 'FuncDecl') {
        stackSlotOffsets.clear();
        stackSlotTypes.clear();
        spDeltaTracked = 0;
        spTrackingValid = true;
        spTrackingInvalidatedByMutation = false;

        const localDecls = item.locals?.decls ?? [];
        for (let li = 0; li < localDecls.length; li++) {
          const decl = localDecls[li]!;
          if (!resolveScalarKind(decl.typeExpr)) {
            diagAt(
              diagnostics,
              decl.span,
              `Local "${decl.name}" must be byte, word, or addr in the current ABI.`,
            );
          }
          stackSlotOffsets.set(decl.name.toLowerCase(), 2 * li);
          stackSlotTypes.set(decl.name.toLowerCase(), decl.typeExpr);
        }
        const frameSize = localDecls.length * 2;
        const argc = item.params.length;
        const hasStackSlots = frameSize > 0 || argc > 0;
        for (let paramIndex = 0; paramIndex < argc; paramIndex++) {
          const p = item.params[paramIndex]!;
          if (!resolveScalarKind(p.typeExpr)) {
            diagAt(
              diagnostics,
              p.span,
              `Parameter "${p.name}" must be byte, word, or addr in the current ABI.`,
            );
          }
          const base = frameSize + 2 + 2 * paramIndex;
          stackSlotOffsets.set(p.name.toLowerCase(), base);
          stackSlotTypes.set(p.name.toLowerCase(), p.typeExpr);
        }

        let epilogueLabel = `__zax_epilogue_${generatedLabelCounter++}`;
        while (taken.has(epilogueLabel)) {
          epilogueLabel = `__zax_epilogue_${generatedLabelCounter++}`;
        }
        // Synthetic per-function cleanup label used for rewritten returns.
        let emitSyntheticEpilogue = frameSize > 0;

        // Function entry label.
        if (taken.has(item.name)) {
          diag(diagnostics, item.span.file, `Duplicate symbol name "${item.name}".`);
        } else {
          taken.add(item.name);
          pending.push({
            kind: 'label',
            name: item.name,
            section: 'code',
            offset: codeOffset,
            file: item.span.file,
            line: item.span.start.line,
            scope: 'global',
          });
        }

        if (frameSize > 0) {
          // Reserve local frame: stack space is uninitialized, so push BC words is acceptable.
          for (let k = 0; k < frameSize / 2; k++) {
            if (!emitInstr('push', [{ kind: 'Reg', span: item.span, name: 'BC' }], item.span))
              break;
          }
        }
        // Track SP deltas relative to the start of user asm, after prologue reservation.
        spDeltaTracked = 0;
        spTrackingValid = true;
        spTrackingInvalidatedByMutation = false;

        type FlowState = {
          reachable: boolean;
          spDelta: number;
          spValid: boolean;
          spInvalidDueToMutation: boolean;
        };
        let flow: FlowState = {
          reachable: true,
          spDelta: 0,
          spValid: true,
          spInvalidDueToMutation: false,
        };
        const opExpansionStack: string[] = [];

        const syncFromFlow = (): void => {
          spDeltaTracked = flow.spDelta;
          spTrackingValid = flow.spValid;
          spTrackingInvalidatedByMutation = flow.spInvalidDueToMutation;
        };
        const syncToFlow = (): void => {
          flow.spDelta = spDeltaTracked;
          flow.spValid = spTrackingValid;
          flow.spInvalidDueToMutation = spTrackingInvalidatedByMutation;
        };
        const snapshotFlow = (): FlowState => ({ ...flow });
        const restoreFlow = (state: FlowState): void => {
          flow = { ...state };
          syncFromFlow();
        };

        const newHiddenLabel = (prefix: string): string => {
          let n = `${prefix}_${generatedLabelCounter++}`;
          while (taken.has(n)) {
            n = `${prefix}_${generatedLabelCounter++}`;
          }
          return n;
        };
        const defineCodeLabel = (
          name: string,
          span: SourceSpan,
          scope: 'global' | 'local',
        ): void => {
          if (taken.has(name)) {
            diag(diagnostics, span.file, `Duplicate symbol name "${name}".`);
            return;
          }
          taken.add(name);
          pending.push({
            kind: 'label',
            name,
            section: 'code',
            offset: codeOffset,
            file: span.file,
            line: span.start.line,
            scope,
          });
        };
        const emitJumpTo = (label: string, span: SourceSpan): void => {
          emitAbs16Fixup(0xc3, label.toLowerCase(), 0, span);
        };
        const emitJumpCondTo = (op: number, label: string, span: SourceSpan): void => {
          emitAbs16Fixup(op, label.toLowerCase(), 0, span);
        };
        const emitJumpIfFalse = (cc: string, label: string, span: SourceSpan): boolean => {
          if (cc === '__missing__') return false;
          const inv = inverseConditionName(cc);
          if (!inv) {
            diagAt(diagnostics, span, `Unsupported condition code "${cc}".`);
            return false;
          }
          const op = conditionOpcodeFromName(inv);
          if (op === undefined) {
            diagAt(diagnostics, span, `Unsupported condition code "${cc}".`);
            return false;
          }
          emitJumpCondTo(op, label, span);
          return true;
        };
        const joinFlows = (
          left: FlowState,
          right: FlowState,
          span: SourceSpan,
          contextName: string,
        ): FlowState => {
          if (!left.reachable && !right.reachable)
            return {
              reachable: false,
              spDelta: 0,
              spValid: true,
              spInvalidDueToMutation: false,
            };
          if (!left.reachable) return { ...right };
          if (!right.reachable) return { ...left };
          if (
            (!left.spValid || !right.spValid) &&
            (left.spInvalidDueToMutation || right.spInvalidDueToMutation)
          ) {
            diagAt(
              diagnostics,
              span,
              `Cannot verify stack depth at ${contextName} join due to untracked SP mutation.`,
            );
          }
          if (left.spValid && right.spValid && left.spDelta !== right.spDelta) {
            diagAt(
              diagnostics,
              span,
              `Stack depth mismatch at ${contextName} join (${left.spDelta} vs ${right.spDelta}).`,
            );
          }
          return {
            reachable: true,
            spDelta: left.spDelta,
            spValid: left.spValid && right.spValid,
            spInvalidDueToMutation: left.spInvalidDueToMutation || right.spInvalidDueToMutation,
          };
        };
        const emitSelectCompareToImm16 = (
          value: number,
          mismatchLabel: string,
          span: SourceSpan,
        ): void => {
          emitCodeBytes(Uint8Array.of(0x7d), span.file); // ld a, l
          emitCodeBytes(Uint8Array.of(0xfe, value & 0xff), span.file); // cp imm8
          emitJumpCondTo(0xc2, mismatchLabel, span); // jp nz, mismatch
          emitCodeBytes(Uint8Array.of(0x7c), span.file); // ld a, h
          emitCodeBytes(Uint8Array.of(0xfe, (value >> 8) & 0xff), span.file); // cp imm8
          emitJumpCondTo(0xc2, mismatchLabel, span); // jp nz, mismatch
        };
        const emitSelectCompareReg8ToImm8 = (
          value: number,
          mismatchLabel: string,
          span: SourceSpan,
        ): void => {
          emitCodeBytes(Uint8Array.of(0xfe, value & 0xff), span.file); // cp imm8
          emitJumpCondTo(0xc2, mismatchLabel, span); // jp nz, mismatch
        };
        const loadSelectorIntoHL = (selector: AsmOperandNode, span: SourceSpan): boolean => {
          // Select dispatch computes selector value once and keeps it in HL for comparisons.
          if (selector.kind === 'Reg') {
            const r = selector.name.toUpperCase();
            if (r === 'BC' || r === 'DE' || r === 'HL') {
              if (!emitInstr('push', [{ kind: 'Reg', span, name: r }], span)) return false;
              return emitInstr('pop', [{ kind: 'Reg', span, name: 'HL' }], span);
            }
            if (r === 'SP') {
              if (!loadImm16ToHL(0, span)) return false;
              return emitInstr(
                'add',
                [
                  { kind: 'Reg', span, name: 'HL' },
                  { kind: 'Reg', span, name: 'SP' },
                ],
                span,
              );
            }
            if (reg8.has(r)) {
              if (
                !emitInstr(
                  'ld',
                  [
                    { kind: 'Reg', span, name: 'H' },
                    { kind: 'Imm', span, expr: { kind: 'ImmLiteral', span, value: 0 } },
                  ],
                  span,
                )
              ) {
                return false;
              }
              return emitInstr(
                'ld',
                [
                  { kind: 'Reg', span, name: 'L' },
                  { kind: 'Reg', span, name: r },
                ],
                span,
              );
            }
          }
          if (selector.kind === 'Imm') {
            const v = evalImmExpr(selector.expr, env, diagnostics);
            if (v === undefined) {
              diagAt(diagnostics, span, `Failed to evaluate select selector.`);
              return false;
            }
            return loadImm16ToHL(v & 0xffff, span);
          }
          if (selector.kind === 'Ea') {
            if (!pushEaAddress(selector.expr, span)) return false;
            return emitInstr('pop', [{ kind: 'Reg', span, name: 'HL' }], span);
          }
          if (selector.kind === 'Mem') {
            if (!pushMemValue(selector.expr, 'word', span)) return false;
            return emitInstr('pop', [{ kind: 'Reg', span, name: 'HL' }], span);
          }
          diagAt(diagnostics, span, `Unsupported selector form in select.`);
          return false;
        };

        const emitAsmInstruction = (asmItem: AsmInstructionNode): void => {
          const diagIfRetStackImbalanced = (): void => {
            if (spTrackingValid && spDeltaTracked !== 0) {
              diagAt(
                diagnostics,
                asmItem.span,
                `ret with non-zero tracked stack delta (${spDeltaTracked}); function stack is imbalanced.`,
              );
              return;
            }
            if (!spTrackingValid && spTrackingInvalidatedByMutation && hasStackSlots) {
              diagAt(
                diagnostics,
                asmItem.span,
                `ret reached after untracked SP mutation; cannot verify function stack balance.`,
              );
            }
          };
          const callable = callables.get(asmItem.head.toLowerCase());
          if (callable) {
            const args = asmItem.operands;
            const params = callable.kind === 'func' ? callable.node.params : callable.node.params;
            if (args.length !== params.length) {
              diagAt(
                diagnostics,
                asmItem.span,
                `Call to "${asmItem.head}" has ${args.length} argument(s) but expects ${params.length}.`,
              );
              return;
            }

            let ok = true;
            for (let ai = args.length - 1; ai >= 0; ai--) {
              const arg = args[ai]!;
              const param = params[ai]!;
              const scalarKind = resolveScalarKind(param.typeExpr);
              if (!scalarKind) {
                diagAt(
                  diagnostics,
                  asmItem.span,
                  `Unsupported parameter type for "${param.name}".`,
                );
                ok = false;
                break;
              }
              const isByte = scalarKind === 'byte';

              if (isByte) {
                if (arg.kind === 'Reg' && reg8.has(arg.name.toUpperCase())) {
                  ok = pushZeroExtendedReg8(arg.name.toUpperCase(), asmItem.span);
                  if (!ok) break;
                  continue;
                }
                if (arg.kind === 'Imm') {
                  const v = evalImmExpr(arg.expr, env, diagnostics);
                  if (v === undefined) {
                    if (arg.expr.kind === 'ImmName') {
                      ok = pushEaAddress(
                        { kind: 'EaName', span: asmItem.span, name: arg.expr.name } as any,
                        asmItem.span,
                      );
                      if (!ok) break;
                      continue;
                    }
                    diagAt(
                      diagnostics,
                      asmItem.span,
                      `Failed to evaluate argument "${param.name}".`,
                    );
                    ok = false;
                    break;
                  }
                  ok = pushImm16(v & 0xff, asmItem.span);
                  if (!ok) break;
                  continue;
                }
                if (arg.kind === 'Ea') {
                  ok = pushEaAddress(arg.expr, asmItem.span);
                  if (!ok) break;
                  continue;
                }
                if (arg.kind === 'Mem') {
                  ok = pushMemValue(arg.expr, 'byte', asmItem.span);
                  if (!ok) break;
                  continue;
                }
                diagAt(
                  diagnostics,
                  asmItem.span,
                  `Unsupported byte argument form for "${param.name}" in call to "${asmItem.head}".`,
                );
                ok = false;
                break;
              } else {
                if (arg.kind === 'Reg' && reg16.has(arg.name.toUpperCase())) {
                  ok = emitInstr(
                    'push',
                    [{ kind: 'Reg', span: asmItem.span, name: arg.name.toUpperCase() }],
                    asmItem.span,
                  );
                  if (!ok) break;
                  continue;
                }
                if (arg.kind === 'Reg' && reg8.has(arg.name.toUpperCase())) {
                  ok = pushZeroExtendedReg8(arg.name.toUpperCase(), asmItem.span);
                  if (!ok) break;
                  continue;
                }
                if (arg.kind === 'Imm') {
                  const v = evalImmExpr(arg.expr, env, diagnostics);
                  if (v === undefined) {
                    if (arg.expr.kind === 'ImmName') {
                      ok = pushEaAddress(
                        { kind: 'EaName', span: asmItem.span, name: arg.expr.name } as any,
                        asmItem.span,
                      );
                      if (!ok) break;
                      continue;
                    }
                    diagAt(
                      diagnostics,
                      asmItem.span,
                      `Failed to evaluate argument "${param.name}".`,
                    );
                    ok = false;
                    break;
                  }
                  ok = pushImm16(v & 0xffff, asmItem.span);
                  if (!ok) break;
                  continue;
                }
                if (arg.kind === 'Ea') {
                  ok = pushEaAddress(arg.expr, asmItem.span);
                  if (!ok) break;
                  continue;
                }
                if (arg.kind === 'Mem') {
                  ok = pushMemValue(arg.expr, 'word', asmItem.span);
                  if (!ok) break;
                  continue;
                }
                diagAt(
                  diagnostics,
                  asmItem.span,
                  `Unsupported word argument form for "${param.name}" in call to "${asmItem.head}".`,
                );
                ok = false;
                break;
              }
            }

            if (!ok) return;

            if (callable.kind === 'extern') {
              emitAbs16Fixup(0xcd, callable.targetLower, 0, asmItem.span);
            } else {
              emitAbs16Fixup(0xcd, callable.node.name.toLowerCase(), 0, asmItem.span);
            }
            for (let k = 0; k < args.length; k++) {
              emitInstr('pop', [{ kind: 'Reg', span: asmItem.span, name: 'BC' }], asmItem.span);
            }
            syncToFlow();
            return;
          }

          const opCandidates = opsByName.get(asmItem.head.toLowerCase());
          if (opCandidates && opCandidates.length > 0) {
            const matches = opCandidates.filter((candidate) => {
              if (candidate.params.length !== asmItem.operands.length) return false;
              for (let idx = 0; idx < candidate.params.length; idx++) {
                const param = candidate.params[idx]!;
                const arg = asmItem.operands[idx]!;
                if (!matcherMatchesOperand(param.matcher, arg)) return false;
              }
              return true;
            });
            if (matches.length === 0) {
              diagAt(
                diagnostics,
                asmItem.span,
                `No matching op overload for "${asmItem.head}" with provided operands.`,
              );
              return;
            }
            if (matches.length > 1) {
              diagAt(
                diagnostics,
                asmItem.span,
                `Ambiguous op overload for "${asmItem.head}" (${matches.length} matches).`,
              );
              return;
            }
            const opDecl = matches[0]!;
            const opKey = opDecl.name.toLowerCase();
            if (opExpansionStack.includes(opKey)) {
              diagAt(
                diagnostics,
                asmItem.span,
                `Cyclic op expansion detected for "${opDecl.name}".`,
              );
              return;
            }
            const entryFlow = snapshotFlow();

            const bindings = new Map<string, AsmOperandNode>();
            for (let idx = 0; idx < opDecl.params.length; idx++) {
              bindings.set(opDecl.params[idx]!.name.toLowerCase(), asmItem.operands[idx]!);
            }

            const substituteImm = (expr: ImmExprNode): ImmExprNode => {
              if (expr.kind === 'ImmName') {
                const bound = bindings.get(expr.name.toLowerCase());
                if (bound && bound.kind === 'Imm') return cloneImmExpr(bound.expr);
                return { ...expr };
              }
              if (expr.kind === 'ImmUnary') return { ...expr, expr: substituteImm(expr.expr) };
              if (expr.kind === 'ImmBinary') {
                return {
                  ...expr,
                  left: substituteImm(expr.left),
                  right: substituteImm(expr.right),
                };
              }
              return { ...expr };
            };

            const substituteOperand = (operand: AsmOperandNode): AsmOperandNode => {
              if (operand.kind === 'Imm' && operand.expr.kind === 'ImmName') {
                const bound = bindings.get(operand.expr.name.toLowerCase());
                if (bound) return cloneOperand(bound);
                return { ...operand, expr: substituteImm(operand.expr) };
              }
              if (operand.kind === 'Imm') return { ...operand, expr: substituteImm(operand.expr) };
              if (
                (operand.kind === 'Ea' || operand.kind === 'Mem') &&
                operand.expr.kind === 'EaName'
              ) {
                const bound = bindings.get(operand.expr.name.toLowerCase());
                if (bound?.kind === 'Ea') return cloneOperand(bound);
                if (bound?.kind === 'Reg') {
                  return {
                    ...operand,
                    expr: { kind: 'EaName', span: operand.expr.span, name: bound.name },
                  };
                }
                if (bound?.kind === 'Imm' && bound.expr.kind === 'ImmName') {
                  return {
                    ...operand,
                    expr: { kind: 'EaName', span: operand.expr.span, name: bound.expr.name },
                  };
                }
                return cloneOperand(operand);
              }
              return cloneOperand(operand);
            };

            opExpansionStack.push(opKey);
            try {
              const localLabelMap = new Map<string, string>();
              for (const bodyItem of opDecl.body.items) {
                if (bodyItem.kind !== 'AsmLabel') continue;
                const key = bodyItem.name.toLowerCase();
                if (!localLabelMap.has(key)) {
                  localLabelMap.set(
                    key,
                    newHiddenLabel(`__zax_op_${opDecl.name.toLowerCase()}_lbl`),
                  );
                }
              }

              const substituteImmWithOpLabels = (expr: ImmExprNode): ImmExprNode => {
                if (expr.kind === 'ImmName') {
                  const bound = bindings.get(expr.name.toLowerCase());
                  if (bound && bound.kind === 'Imm') return cloneImmExpr(bound.expr);
                  const mapped = localLabelMap.get(expr.name.toLowerCase());
                  if (mapped) return { kind: 'ImmName', span: expr.span, name: mapped };
                  return { ...expr };
                }
                if (expr.kind === 'ImmUnary') {
                  return { ...expr, expr: substituteImmWithOpLabels(expr.expr) };
                }
                if (expr.kind === 'ImmBinary') {
                  return {
                    ...expr,
                    left: substituteImmWithOpLabels(expr.left),
                    right: substituteImmWithOpLabels(expr.right),
                  };
                }
                return { ...expr };
              };

              const substituteOperandWithOpLabels = (operand: AsmOperandNode): AsmOperandNode => {
                const substituteEaWithOpLabels = (ea: EaExprNode): EaExprNode => {
                  if (ea.kind === 'EaName') {
                    const bound = bindings.get(ea.name.toLowerCase());
                    if (bound?.kind === 'Ea') return cloneEaExpr(bound.expr);
                    if (bound?.kind === 'Reg') {
                      return { kind: 'EaName', span: ea.span, name: bound.name };
                    }
                    if (bound?.kind === 'Imm' && bound.expr.kind === 'ImmName') {
                      return { kind: 'EaName', span: ea.span, name: bound.expr.name };
                    }
                    const mapped = localLabelMap.get(ea.name.toLowerCase());
                    if (mapped) return { kind: 'EaName', span: ea.span, name: mapped };
                    return { ...ea };
                  }
                  if (ea.kind === 'EaField') {
                    return { ...ea, base: substituteEaWithOpLabels(ea.base) };
                  }
                  if (ea.kind === 'EaIndex') {
                    const index =
                      ea.index.kind === 'IndexEa'
                        ? { ...ea.index, expr: substituteEaWithOpLabels(ea.index.expr) }
                        : ea.index.kind === 'IndexImm'
                          ? { ...ea.index, value: substituteImmWithOpLabels(ea.index.value) }
                          : { ...ea.index };
                    return { ...ea, base: substituteEaWithOpLabels(ea.base), index };
                  }
                  if (ea.kind === 'EaAdd' || ea.kind === 'EaSub') {
                    return {
                      ...ea,
                      base: substituteEaWithOpLabels(ea.base),
                      offset: substituteImmWithOpLabels(ea.offset),
                    };
                  }
                  return cloneEaExpr(ea);
                };

                if (operand.kind === 'Imm') {
                  if (operand.expr.kind === 'ImmName') {
                    const bound = bindings.get(operand.expr.name.toLowerCase());
                    if (bound) return cloneOperand(bound);
                  }
                  return { ...operand, expr: substituteImmWithOpLabels(operand.expr) };
                }
                if (operand.kind === 'Ea' || operand.kind === 'Mem') {
                  return {
                    ...operand,
                    expr: substituteEaWithOpLabels(operand.expr),
                  };
                }
                return substituteOperand(operand);
              };

              const substituteConditionWithOpLabels = (
                condition: string,
                span: SourceSpan,
              ): string => {
                const bound = bindings.get(condition.toLowerCase());
                if (!bound) return condition;
                const token = normalizeFixedToken(bound);
                if (!token || inverseConditionName(token) === undefined) {
                  diagAt(
                    diagnostics,
                    span,
                    `op "${opDecl.name}" condition parameter "${condition}" must bind to a condition token (NZ/Z/NC/C/PO/PE/P/M).`,
                  );
                  return condition;
                }
                return token;
              };

              const expandedItems: AsmItemNode[] = opDecl.body.items.map((bodyItem) => {
                if (bodyItem.kind === 'AsmInstruction') {
                  return {
                    kind: 'AsmInstruction',
                    span: bodyItem.span,
                    head: bodyItem.head,
                    operands: bodyItem.operands.map((o) => substituteOperandWithOpLabels(o)),
                  };
                }
                if (bodyItem.kind === 'AsmLabel') {
                  return {
                    kind: 'AsmLabel',
                    span: bodyItem.span,
                    name: localLabelMap.get(bodyItem.name.toLowerCase()) ?? bodyItem.name,
                  };
                }
                if (bodyItem.kind === 'Select') {
                  return {
                    kind: 'Select',
                    span: bodyItem.span,
                    selector: substituteOperandWithOpLabels(bodyItem.selector),
                  };
                }
                if (bodyItem.kind === 'Case') {
                  return {
                    kind: 'Case',
                    span: bodyItem.span,
                    value: substituteImmWithOpLabels(bodyItem.value),
                  };
                }
                if (
                  bodyItem.kind === 'If' ||
                  bodyItem.kind === 'While' ||
                  bodyItem.kind === 'Until'
                ) {
                  return {
                    ...bodyItem,
                    cc: substituteConditionWithOpLabels(bodyItem.cc, bodyItem.span),
                  };
                }
                return { ...bodyItem };
              });

              const consumed = lowerAsmRange(expandedItems, 0, new Set());
              if (consumed < expandedItems.length) {
                diagAt(
                  diagnostics,
                  expandedItems[consumed]!.span,
                  `Internal control-flow lowering error.`,
                );
              }
            } finally {
              opExpansionStack.pop();
            }
            const exitFlow = snapshotFlow();
            if (entryFlow.reachable && exitFlow.reachable) {
              if (entryFlow.spValid && exitFlow.spValid && entryFlow.spDelta !== exitFlow.spDelta) {
                const delta = exitFlow.spDelta - entryFlow.spDelta;
                diagAt(
                  diagnostics,
                  asmItem.span,
                  `op "${opDecl.name}" has non-zero net stack delta (${delta} byte(s)).`,
                );
              } else if (
                entryFlow.spValid &&
                !exitFlow.spValid &&
                exitFlow.spInvalidDueToMutation
              ) {
                diagAt(
                  diagnostics,
                  asmItem.span,
                  `op "${opDecl.name}" expansion performs untracked SP mutation; cannot verify net stack delta.`,
                );
              }
            }
            syncToFlow();
            return;
          }

          const head = asmItem.head.toLowerCase();
          const emitRel8FromOperand = (
            operand: AsmOperandNode,
            opcode: number,
            mnemonic: string,
          ): boolean => {
            if (operand.kind !== 'Imm') {
              if (mnemonic === 'djnz' || mnemonic.startsWith('jr')) {
                diagAt(diagnostics, asmItem.span, `${mnemonic} expects disp8`);
              } else {
                diagAt(diagnostics, asmItem.span, `${mnemonic} expects an immediate target.`);
              }
              return false;
            }
            const symbolicTarget = symbolicTargetFromExpr(operand.expr);
            if (symbolicTarget) {
              emitRel8Fixup(
                opcode,
                symbolicTarget.baseLower,
                symbolicTarget.addend,
                asmItem.span,
                mnemonic,
              );
              return true;
            }
            const value = evalImmExpr(operand.expr, env, diagnostics);
            if (value === undefined) {
              diagAt(diagnostics, asmItem.span, `Failed to evaluate ${mnemonic} target.`);
              return false;
            }
            if (value < -128 || value > 127) {
              diagAt(
                diagnostics,
                asmItem.span,
                `${mnemonic} relative branch displacement out of range (-128..127): ${value}.`,
              );
              return false;
            }
            emitCodeBytes(Uint8Array.of(opcode, value & 0xff), asmItem.span.file);
            return true;
          };
          if (head === 'jr') {
            if (asmItem.operands.length === 1) {
              if (!emitRel8FromOperand(asmItem.operands[0]!, 0x18, 'jr')) return;
              flow.reachable = false;
              syncToFlow();
              return;
            }
            if (asmItem.operands.length === 2) {
              const ccOp = asmItem.operands[0]!;
              const ccName =
                ccOp.kind === 'Imm' && ccOp.expr.kind === 'ImmName'
                  ? ccOp.expr.name
                  : ccOp.kind === 'Reg'
                    ? ccOp.name
                    : undefined;
              const opcode = ccName ? jrConditionOpcodeFromName(ccName) : undefined;
              if (opcode === undefined) {
                diagAt(diagnostics, asmItem.span, `jr cc, disp expects NZ/Z/NC/C + disp8`);
                return;
              }
              if (!emitRel8FromOperand(asmItem.operands[1]!, opcode, `jr ${ccName!.toLowerCase()}`))
                return;
              syncToFlow();
              return;
            }
          }
          if (head === 'djnz') {
            if (asmItem.operands.length !== 1) {
              diagAt(diagnostics, asmItem.span, `djnz expects one operand (disp8)`);
              return;
            }
            const target = asmItem.operands[0]!;
            if (target.kind !== 'Imm') {
              diagAt(diagnostics, asmItem.span, `djnz expects disp8`);
              return;
            }
            if (!emitRel8FromOperand(target, 0x10, 'djnz')) return;
            syncToFlow();
            return;
          }
          if (head === 'ret') {
            if (asmItem.operands.length === 0) {
              diagIfRetStackImbalanced();
              if (emitSyntheticEpilogue) {
                emitJumpTo(epilogueLabel, asmItem.span);
              } else {
                emitInstr('ret', [], asmItem.span);
              }
              flow.reachable = false;
              syncToFlow();
              return;
            }
            if (asmItem.operands.length === 1) {
              const op = conditionOpcode(asmItem.operands[0]!);
              if (op === undefined) {
                diagAt(diagnostics, asmItem.span, `ret cc expects a valid condition code`);
                return;
              }
              diagIfRetStackImbalanced();
              emitSyntheticEpilogue = true;
              emitJumpCondTo(op, epilogueLabel, asmItem.span);
              syncToFlow();
              return;
            }
          }

          if (head === 'jp' && asmItem.operands.length === 1) {
            const target = asmItem.operands[0]!;
            if (target.kind === 'Imm') {
              const symbolicTarget = symbolicTargetFromExpr(target.expr);
              if (symbolicTarget) {
                emitAbs16Fixup(0xc3, symbolicTarget.baseLower, symbolicTarget.addend, asmItem.span);
                flow.reachable = false;
                syncToFlow();
                return;
              }
            }
          }
          if (head === 'jp' && asmItem.operands.length === 2) {
            const ccOp = asmItem.operands[0]!;
            const ccName =
              ccOp.kind === 'Imm' && ccOp.expr.kind === 'ImmName'
                ? ccOp.expr.name
                : ccOp.kind === 'Reg'
                  ? ccOp.name
                  : undefined;
            const opcode = ccName ? conditionOpcodeFromName(ccName) : undefined;
            const target = asmItem.operands[1]!;
            if (opcode !== undefined && target.kind === 'Imm') {
              const symbolicTarget = symbolicTargetFromExpr(target.expr);
              if (symbolicTarget) {
                emitAbs16Fixup(
                  opcode,
                  symbolicTarget.baseLower,
                  symbolicTarget.addend,
                  asmItem.span,
                );
                syncToFlow();
                return;
              }
            }
          }
          if (head === 'call' && asmItem.operands.length === 1) {
            const target = asmItem.operands[0]!;
            if (target.kind === 'Imm') {
              const symbolicTarget = symbolicTargetFromExpr(target.expr);
              if (symbolicTarget) {
                emitAbs16Fixup(0xcd, symbolicTarget.baseLower, symbolicTarget.addend, asmItem.span);
                syncToFlow();
                return;
              }
            }
          }
          if (head === 'call' && asmItem.operands.length === 2) {
            const ccOp = asmItem.operands[0]!;
            const ccName =
              ccOp.kind === 'Imm' && ccOp.expr.kind === 'ImmName'
                ? ccOp.expr.name
                : ccOp.kind === 'Reg'
                  ? ccOp.name
                  : undefined;
            const opcode = ccName ? callConditionOpcodeFromName(ccName) : undefined;
            const target = asmItem.operands[1]!;
            if (opcode !== undefined && target.kind === 'Imm') {
              const symbolicTarget = symbolicTargetFromExpr(target.expr);
              if (symbolicTarget) {
                emitAbs16Fixup(
                  opcode,
                  symbolicTarget.baseLower,
                  symbolicTarget.addend,
                  asmItem.span,
                );
                syncToFlow();
                return;
              }
            }
          }

          if (head === 'ld' && asmItem.operands.length === 2) {
            const dstOp = asmItem.operands[0]!;
            const srcOp = asmItem.operands[1]!;
            const dst = dstOp.kind === 'Reg' ? dstOp.name.toUpperCase() : undefined;
            const opcode =
              dst === 'BC'
                ? 0x01
                : dst === 'DE'
                  ? 0x11
                  : dst === 'HL'
                    ? 0x21
                    : dst === 'SP'
                      ? 0x31
                      : undefined;
            if (opcode !== undefined && srcOp.kind === 'Imm' && srcOp.expr.kind === 'ImmName') {
              const v = evalImmExpr(srcOp.expr, env, diagnostics);
              if (v === undefined) {
                emitAbs16Fixup(opcode, srcOp.expr.name.toLowerCase(), 0, asmItem.span);
                syncToFlow();
                return;
              }
            }
            if (
              (dst === 'IX' || dst === 'IY') &&
              srcOp.kind === 'Imm' &&
              srcOp.expr.kind === 'ImmName'
            ) {
              const v = evalImmExpr(srcOp.expr, env, diagnostics);
              if (v === undefined) {
                emitAbs16FixupPrefixed(
                  dst === 'IX' ? 0xdd : 0xfd,
                  0x21,
                  srcOp.expr.name.toLowerCase(),
                  0,
                  asmItem.span,
                );
                syncToFlow();
                return;
              }
            }
          }

          if (lowerLdWithEa(asmItem)) {
            syncToFlow();
            return;
          }

          const encoded = encodeInstruction(asmItem, env, diagnostics);
          if (!encoded) return;
          emitCodeBytes(encoded, asmItem.span.file);
          applySpTracking(asmItem.head, asmItem.operands);

          if ((head === 'jp' || head === 'jr') && asmItem.operands.length === 1) {
            flow.reachable = false;
          } else if (
            (head === 'ret' || head === 'retn' || head === 'reti') &&
            asmItem.operands.length === 0
          ) {
            flow.reachable = false;
          }
          syncToFlow();
        };

        const lowerAsmRange = (
          asmItems: readonly AsmItemNode[],
          startIndex: number,
          stopKinds: Set<string>,
        ): number => {
          let i = startIndex;
          while (i < asmItems.length) {
            const it = asmItems[i]!;
            if (stopKinds.has(it.kind)) return i;
            if (it.kind === 'AsmLabel') {
              defineCodeLabel(it.name, it.span, 'global');
              if (!flow.reachable) {
                flow.reachable = true;
                flow.spValid = false;
                flow.spDelta = 0;
                flow.spInvalidDueToMutation = false;
                syncFromFlow();
              }
              i++;
              continue;
            }
            if (it.kind === 'AsmInstruction') {
              emitAsmInstruction(it);
              i++;
              continue;
            }
            if (it.kind === 'If') {
              const entry = snapshotFlow();
              const elseLabel = newHiddenLabel('__zax_if_else');
              const endLabel = newHiddenLabel('__zax_if_end');
              emitJumpIfFalse(it.cc, elseLabel, it.span);

              let j = lowerAsmRange(asmItems, i + 1, new Set(['Else', 'End']));
              const thenExit = snapshotFlow();
              if (j >= asmItems.length) {
                diagAt(diagnostics, it.span, `if without matching end.`);
                return asmItems.length;
              }
              const term = asmItems[j]!;
              if (term.kind === 'Else') {
                if (thenExit.reachable) emitJumpTo(endLabel, term.span);
                defineCodeLabel(elseLabel, term.span, 'local');
                restoreFlow(entry);
                j = lowerAsmRange(asmItems, j + 1, new Set(['End']));
                const elseExit = snapshotFlow();
                if (j >= asmItems.length || asmItems[j]!.kind !== 'End') {
                  diagAt(diagnostics, it.span, `if/else without matching end.`);
                  return asmItems.length;
                }
                defineCodeLabel(endLabel, asmItems[j]!.span, 'local');
                restoreFlow(joinFlows(thenExit, elseExit, asmItems[j]!.span, 'if/else'));
                i = j + 1;
                continue;
              }
              if (term.kind !== 'End') {
                diagAt(diagnostics, it.span, `if without matching end.`);
                return asmItems.length;
              }
              defineCodeLabel(elseLabel, term.span, 'local');
              restoreFlow(joinFlows(thenExit, entry, term.span, 'if'));
              i = j + 1;
              continue;
            }
            if (it.kind === 'While') {
              const entry = snapshotFlow();
              const condLabel = newHiddenLabel('__zax_while_cond');
              const endLabel = newHiddenLabel('__zax_while_end');
              defineCodeLabel(condLabel, it.span, 'local');
              emitJumpIfFalse(it.cc, endLabel, it.span);

              const j = lowerAsmRange(asmItems, i + 1, new Set(['End']));
              const bodyExit = snapshotFlow();
              if (j >= asmItems.length || asmItems[j]!.kind !== 'End') {
                diagAt(diagnostics, it.span, `while without matching end.`);
                return asmItems.length;
              }
              if (
                bodyExit.reachable &&
                bodyExit.spValid &&
                entry.spValid &&
                bodyExit.spDelta !== entry.spDelta
              ) {
                diagAt(
                  diagnostics,
                  asmItems[j]!.span,
                  `Stack depth mismatch at while back-edge (${bodyExit.spDelta} vs ${entry.spDelta}).`,
                );
              } else if (
                bodyExit.reachable &&
                (!bodyExit.spValid || !entry.spValid) &&
                (bodyExit.spInvalidDueToMutation || entry.spInvalidDueToMutation)
              ) {
                diagAt(
                  diagnostics,
                  asmItems[j]!.span,
                  `Cannot verify stack depth at while back-edge due to untracked SP mutation.`,
                );
              }
              if (bodyExit.reachable) emitJumpTo(condLabel, asmItems[j]!.span);
              defineCodeLabel(endLabel, asmItems[j]!.span, 'local');
              restoreFlow(entry);
              i = j + 1;
              continue;
            }
            if (it.kind === 'Repeat') {
              const entry = snapshotFlow();
              const loopLabel = newHiddenLabel('__zax_repeat_body');
              defineCodeLabel(loopLabel, it.span, 'local');
              const j = lowerAsmRange(asmItems, i + 1, new Set(['Until']));
              if (j >= asmItems.length || asmItems[j]!.kind !== 'Until') {
                diagAt(diagnostics, it.span, `repeat without matching until.`);
                return asmItems.length;
              }
              const untilNode = asmItems[j]!;
              const bodyExit = snapshotFlow();
              const ok = emitJumpIfFalse(untilNode.cc, loopLabel, untilNode.span);
              if (!ok) return asmItems.length;
              if (
                bodyExit.reachable &&
                bodyExit.spValid &&
                entry.spValid &&
                bodyExit.spDelta !== entry.spDelta
              ) {
                diagAt(
                  diagnostics,
                  untilNode.span,
                  `Stack depth mismatch at repeat/until (${bodyExit.spDelta} vs ${entry.spDelta}).`,
                );
              } else if (
                bodyExit.reachable &&
                (!bodyExit.spValid || !entry.spValid) &&
                (bodyExit.spInvalidDueToMutation || entry.spInvalidDueToMutation)
              ) {
                diagAt(
                  diagnostics,
                  untilNode.span,
                  `Cannot verify stack depth at repeat/until due to untracked SP mutation.`,
                );
              }
              i = j + 1;
              continue;
            }
            if (it.kind === 'Select') {
              const entry = snapshotFlow();
              const dispatchLabel = newHiddenLabel('__zax_select_dispatch');
              const endLabel = newHiddenLabel('__zax_select_end');
              const selectorIsReg8 =
                it.selector.kind === 'Reg' && reg8.has(it.selector.name.toUpperCase());
              const caseValues = new Set<number>();
              const caseArms: { value: number; bodyLabel: string; span: SourceSpan }[] = [];
              let elseLabel: string | undefined;
              let sawArm = false;
              const armExits: FlowState[] = [];

              emitJumpTo(dispatchLabel, it.span);
              let j = i + 1;

              const closeArm = (span: SourceSpan) => {
                armExits.push(snapshotFlow());
                if (flow.reachable) emitJumpTo(endLabel, span);
              };

              while (j < asmItems.length) {
                const armItem = asmItems[j]!;
                if (armItem.kind === 'Case') {
                  const bodyLabel = newHiddenLabel('__zax_case');
                  defineCodeLabel(bodyLabel, armItem.span, 'local');
                  let k = j;
                  while (k < asmItems.length) {
                    const caseItem = asmItems[k]!;
                    if (caseItem.kind !== 'Case') break;
                    const v = evalImmExpr(caseItem.value, env, diagnostics);
                    if (v === undefined) {
                      diagAt(diagnostics, caseItem.span, `Failed to evaluate case value.`);
                    } else {
                      const key = v & 0xffff;
                      const canMatchSelector = !selectorIsReg8 || key <= 0xff;
                      if (selectorIsReg8 && key > 0xff) {
                        warnAt(
                          diagnostics,
                          caseItem.span,
                          `Case value ${key} can never match reg8 selector.`,
                        );
                      }
                      if (caseValues.has(key)) {
                        diagAt(diagnostics, caseItem.span, `Duplicate case value ${key}.`);
                      } else {
                        caseValues.add(key);
                        if (canMatchSelector) {
                          caseArms.push({ value: key, bodyLabel, span: caseItem.span });
                        }
                      }
                    }
                    k++;
                  }
                  restoreFlow(entry);
                  sawArm = true;
                  j = lowerAsmRange(asmItems, k, new Set(['Case', 'SelectElse', 'End']));
                  closeArm(asmItems[Math.min(j, asmItems.length - 1)]!.span);
                  continue;
                }
                if (armItem.kind === 'SelectElse') {
                  if (elseLabel) {
                    diagAt(diagnostics, armItem.span, `Duplicate else in select.`);
                  }
                  elseLabel = newHiddenLabel('__zax_select_else');
                  defineCodeLabel(elseLabel, armItem.span, 'local');
                  restoreFlow(entry);
                  sawArm = true;
                  j = lowerAsmRange(asmItems, j + 1, new Set(['End']));
                  closeArm(asmItems[Math.min(j, asmItems.length - 1)]!.span);
                  continue;
                }
                if (armItem.kind === 'End') break;
                diagAt(diagnostics, armItem.span, `Expected case/else/end inside select.`);
                j++;
              }

              if (j >= asmItems.length || asmItems[j]!.kind !== 'End') {
                diagAt(diagnostics, it.span, `select without matching end.`);
                return asmItems.length;
              }
              if (!sawArm) {
                diagAt(diagnostics, it.span, `select must contain at least one case or else arm.`);
              }

              defineCodeLabel(dispatchLabel, asmItems[j]!.span, 'local');
              let selectorConst: number | undefined;
              if (it.selector.kind === 'Imm') {
                const v = evalImmExpr(it.selector.expr, env, diagnostics);
                if (v !== undefined) selectorConst = v & 0xffff;
              }
              if (selectorConst !== undefined) {
                const matched = caseArms.find((arm) => arm.value === selectorConst);
                emitJumpTo(matched?.bodyLabel ?? elseLabel ?? endLabel, asmItems[j]!.span);
              } else if (caseArms.length === 0) {
                emitJumpTo(elseLabel ?? endLabel, asmItems[j]!.span);
              } else {
                if (!emitInstr('push', [{ kind: 'Reg', span: it.span, name: 'HL' }], it.span)) {
                  return asmItems.length;
                }
                if (!loadSelectorIntoHL(it.selector, it.span)) {
                  return asmItems.length;
                }
                if (selectorIsReg8) {
                  emitCodeBytes(Uint8Array.of(0x7d), it.span.file); // ld a, l
                }
                for (const arm of caseArms) {
                  const miss = newHiddenLabel('__zax_select_next');
                  if (selectorIsReg8) {
                    emitSelectCompareReg8ToImm8(arm.value, miss, arm.span);
                  } else {
                    emitSelectCompareToImm16(arm.value, miss, arm.span);
                  }
                  emitInstr('pop', [{ kind: 'Reg', span: arm.span, name: 'HL' }], arm.span);
                  emitJumpTo(arm.bodyLabel, arm.span);
                  defineCodeLabel(miss, arm.span, 'local');
                }
                emitInstr(
                  'pop',
                  [{ kind: 'Reg', span: asmItems[j]!.span, name: 'HL' }],
                  asmItems[j]!.span,
                );
                emitJumpTo(elseLabel ?? endLabel, asmItems[j]!.span);
              }

              defineCodeLabel(endLabel, asmItems[j]!.span, 'local');
              const joinInputs = [...armExits];
              if (!elseLabel) joinInputs.push(entry);
              const reachable = joinInputs.filter((f) => f.reachable);
              if (reachable.length === 0) {
                restoreFlow({
                  reachable: false,
                  spDelta: 0,
                  spValid: true,
                  spInvalidDueToMutation: false,
                });
              } else {
                const base = reachable[0]!;
                const allValid = reachable.every((f) => f.spValid);
                if (allValid) {
                  const mismatch = reachable.find((f) => f.spDelta !== base.spDelta);
                  if (mismatch) {
                    diagAt(
                      diagnostics,
                      asmItems[j]!.span,
                      `Stack depth mismatch at select join (${base.spDelta} vs ${mismatch.spDelta}).`,
                    );
                  }
                } else if (reachable.some((f) => f.spInvalidDueToMutation)) {
                  diagAt(
                    diagnostics,
                    asmItems[j]!.span,
                    `Cannot verify stack depth at select join due to untracked SP mutation.`,
                  );
                }
                restoreFlow({
                  reachable: true,
                  spDelta: base.spDelta,
                  spValid: allValid,
                  spInvalidDueToMutation: reachable.some((f) => f.spInvalidDueToMutation),
                });
              }
              i = j + 1;
              continue;
            }
            if (
              it.kind === 'Else' ||
              it.kind === 'End' ||
              it.kind === 'Until' ||
              it.kind === 'Case' ||
              it.kind === 'SelectElse'
            ) {
              diagAt(diagnostics, it.span, `Unexpected "${it.kind.toLowerCase()}" in asm block.`);
              i++;
              continue;
            }
          }
          return i;
        };

        const consumed = lowerAsmRange(item.asm.items, 0, new Set());
        if (consumed < item.asm.items.length) {
          diagAt(
            diagnostics,
            item.asm.items[consumed]!.span,
            `Internal control-flow lowering error.`,
          );
        }
        syncToFlow();
        if (flow.reachable && flow.spValid && flow.spDelta !== 0) {
          diagAt(
            diagnostics,
            item.span,
            `Function "${item.name}" has non-zero stack delta at fallthrough (${flow.spDelta}).`,
          );
        } else if (
          flow.reachable &&
          !flow.spValid &&
          flow.spInvalidDueToMutation &&
          hasStackSlots
        ) {
          diagAt(
            diagnostics,
            item.span,
            `Function "${item.name}" has untracked SP mutation at fallthrough; cannot verify stack balance.`,
          );
        }
        if (!emitSyntheticEpilogue && flow.reachable) {
          emitInstr('ret', [], item.span);
          flow.reachable = false;
          syncToFlow();
        }

        if (emitSyntheticEpilogue) {
          // When control can fall through to the end of the function body, route it through the
          // synthetic epilogue. If flow is unreachable here (e.g. a terminal `ret`), avoid emitting
          // a dead jump before the epilogue label.
          if (flow.reachable) {
            emitAbs16Fixup(0xc3, epilogueLabel.toLowerCase(), 0, item.span);
          }
          pending.push({
            kind: 'label',
            name: epilogueLabel,
            section: 'code',
            offset: codeOffset,
            file: item.span.file,
            line: item.span.start.line,
            scope: 'local',
          });
          for (let k = 0; k < frameSize / 2; k++) {
            if (!emitInstr('pop', [{ kind: 'Reg', span: item.span, name: 'BC' }], item.span)) break;
          }
          emitInstr('ret', [], item.span);
        }
        continue;
      }

      if (item.kind === 'DataBlock') {
        const dataBlock = item as DataBlockNode;
        for (const decl of dataBlock.decls) {
          const okToDeclareSymbol = !taken.has(decl.name);
          if (!okToDeclareSymbol) {
            diag(diagnostics, decl.span.file, `Duplicate symbol name "${decl.name}".`);
          } else {
            taken.add(decl.name);
            pending.push({
              kind: 'data',
              name: decl.name,
              section: 'data',
              offset: dataOffset,
              file: decl.span.file,
              line: decl.span.start.line,
              scope: 'global',
            });
          }

          const type = decl.typeExpr;
          const init = decl.initializer;

          const emitByte = (b: number) => {
            dataBytes.set(dataOffset, b & 0xff);
            dataOffset++;
          };
          const emitWord = (w: number) => {
            emitByte(w & 0xff);
            emitByte((w >> 8) & 0xff);
          };

          const elementType =
            type.kind === 'ArrayType'
              ? type.element.kind === 'TypeName'
                ? type.element.name
                : undefined
              : type.kind === 'TypeName'
                ? type.name
                : undefined;
          const elementSize =
            elementType === 'word' || elementType === 'addr' || elementType === 'ptr'
              ? 2
              : elementType === 'byte'
                ? 1
                : undefined;
          if (!elementType || !elementSize) {
            diag(
              diagnostics,
              decl.span.file,
              `Unsupported data type for "${decl.name}" (expected byte/word/addr/ptr or fixed-length arrays of those).`,
            );
            continue;
          }

          const length = type.kind === 'ArrayType' ? type.length : 1;

          if (init.kind === 'InitString') {
            if (elementSize !== 1) {
              diag(
                diagnostics,
                decl.span.file,
                `String initializer requires byte element type for "${decl.name}".`,
              );
              continue;
            }
            if (length !== undefined && init.value.length !== length) {
              diag(diagnostics, decl.span.file, `String length mismatch for "${decl.name}".`);
              continue;
            }
            for (let idx = 0; idx < init.value.length; idx++) {
              emitByte(init.value.charCodeAt(idx));
            }
            continue;
          }

          const values: number[] = [];
          for (const e of init.elements) {
            const v = evalImmExpr(e, env, diagnostics);
            if (v === undefined) {
              diag(
                diagnostics,
                decl.span.file,
                `Failed to evaluate data initializer for "${decl.name}".`,
              );
              break;
            }
            values.push(v);
          }

          if (length !== undefined && values.length !== length) {
            diag(diagnostics, decl.span.file, `Initializer length mismatch for "${decl.name}".`);
            continue;
          }

          for (const v of values) {
            if (elementSize === 1) emitByte(v);
            else emitWord(v);
          }
        }
        continue;
      }

      if (item.kind === 'VarBlock' && item.scope === 'module') {
        const varBlock = item as VarBlockNode;
        for (const decl of varBlock.decls) {
          const size = sizeOfTypeExpr(decl.typeExpr, env, diagnostics);
          if (size === undefined) continue;
          if (env.consts.has(decl.name)) {
            diag(diagnostics, decl.span.file, `Var name "${decl.name}" collides with a const.`);
            varOffset += size;
            continue;
          }
          if (env.enums.has(decl.name)) {
            diag(
              diagnostics,
              decl.span.file,
              `Var name "${decl.name}" collides with an enum member.`,
            );
            varOffset += size;
            continue;
          }
          if (env.types.has(decl.name)) {
            diag(diagnostics, decl.span.file, `Var name "${decl.name}" collides with a type name.`);
            varOffset += size;
            continue;
          }
          if (taken.has(decl.name)) {
            diag(
              diagnostics,
              decl.span.file,
              `Duplicate symbol name "${decl.name}" for var declaration.`,
            );
            varOffset += size;
            continue;
          }
          taken.add(decl.name);
          pending.push({
            kind: 'var',
            name: decl.name,
            section: 'var',
            offset: varOffset,
            file: decl.span.file,
            line: decl.span.start.line,
            scope: 'global',
            size,
          });
          varOffset += size;
        }
      }
    }
  }

  const evalBase = (kind: SectionKind): number | undefined => {
    const at = baseExprs[kind];
    if (!at) return undefined;
    const v = evalImmExpr(at, env, diagnostics);
    if (v === undefined) {
      diag(diagnostics, at.span.file, `Failed to evaluate section "${kind}" base address.`);
      return undefined;
    }
    if (v < 0 || v > 0xffff) {
      diag(diagnostics, at.span.file, `Section "${kind}" base address out of range (0..65535).`);
      return undefined;
    }
    return v;
  };

  const explicitCodeBase = evalBase('code');
  const explicitDataBase = evalBase('data');
  const explicitVarBase = evalBase('var');

  const codeOk = explicitCodeBase !== undefined || !baseExprs.code;
  const codeBase = explicitCodeBase ?? 0;

  const dataBase =
    explicitDataBase ??
    (codeOk
      ? alignTo(codeBase + codeOffset, 2)
      : (diag(
          diagnostics,
          primaryFile,
          `Cannot compute default data base address because code base address is invalid.`,
        ),
        0));
  const dataOk = explicitDataBase !== undefined || (baseExprs.data === undefined && codeOk);

  const varBase =
    explicitVarBase ??
    (dataOk
      ? alignTo(dataBase + dataOffset, 2)
      : (diag(
          diagnostics,
          primaryFile,
          `Cannot compute default var base address because data base address is invalid.`,
        ),
        0));
  const varOk = explicitVarBase !== undefined || (baseExprs.var === undefined && dataOk);

  const writeSection = (base: number, section: Map<number, number>, file: string) => {
    for (const [off, b] of section) {
      const addr = base + off;
      if (addr < 0 || addr > 0xffff) {
        diag(diagnostics, file, `Emitted byte address out of range: ${addr}.`);
        continue;
      }
      if (bytes.has(addr)) {
        diag(diagnostics, file, `Byte overlap at address ${addr}.`);
        continue;
      }
      bytes.set(addr, b);
    }
  };

  // Resolve symbol addresses for fixups (functions/labels/etc).
  const addrByNameLower = new Map<string, number>();
  for (const ps of pending) {
    const base = ps.section === 'code' ? codeBase : ps.section === 'data' ? dataBase : varBase;
    const ok = ps.section === 'code' ? codeOk : ps.section === 'data' ? dataOk : varOk;
    if (!ok) continue;
    addrByNameLower.set(ps.name.toLowerCase(), base + ps.offset);
  }
  for (const sym of symbols) {
    if (sym.kind === 'constant') continue;
    addrByNameLower.set(sym.name.toLowerCase(), sym.address);
  }
  for (const sym of absoluteSymbols) {
    if (sym.kind === 'constant') continue;
    addrByNameLower.set(sym.name.toLowerCase(), sym.address);
  }
  for (const ex of deferredExterns) {
    const base = addrByNameLower.get(ex.baseLower);
    if (base === undefined) {
      diag(
        diagnostics,
        ex.file,
        `Failed to resolve extern base symbol "${ex.baseLower}" for "${ex.name}".`,
      );
      continue;
    }
    const addr = base + ex.addend;
    if (addr < 0 || addr > 0xffff) {
      diag(
        diagnostics,
        ex.file,
        `extern func "${ex.name}" resolved address out of range (0..65535).`,
      );
      continue;
    }
    addrByNameLower.set(ex.name.toLowerCase(), addr);
    symbols.push({
      kind: 'label',
      name: ex.name,
      address: addr,
      file: ex.file,
      line: ex.line,
      scope: 'global',
    });
  }

  for (const fx of fixups) {
    const base = addrByNameLower.get(fx.baseLower);
    const addr = base === undefined ? undefined : base + fx.addend;
    if (addr === undefined) {
      diag(diagnostics, fx.file, `Unresolved symbol "${fx.baseLower}" in 16-bit fixup.`);
      continue;
    }
    if (addr < 0 || addr > 0xffff) {
      diag(
        diagnostics,
        fx.file,
        `16-bit fixup address out of range for "${fx.baseLower}" with addend ${fx.addend}: ${addr}.`,
      );
      continue;
    }
    codeBytes.set(fx.offset, addr & 0xff);
    codeBytes.set(fx.offset + 1, (addr >> 8) & 0xff);
  }
  for (const fx of rel8Fixups) {
    const base = addrByNameLower.get(fx.baseLower);
    const target = base === undefined ? undefined : base + fx.addend;
    if (target === undefined) {
      diag(
        diagnostics,
        fx.file,
        `Unresolved symbol "${fx.baseLower}" in rel8 ${fx.mnemonic} fixup.`,
      );
      continue;
    }
    const origin = codeBase + fx.origin;
    const disp = target - origin;
    if (disp < -128 || disp > 127) {
      diag(
        diagnostics,
        fx.file,
        `${fx.mnemonic} target out of range for rel8 branch (${disp}, expected -128..127).`,
      );
      continue;
    }
    codeBytes.set(fx.offset, disp & 0xff);
  }

  for (const [addr, b] of hexBytes) {
    if (addr < 0 || addr > 0xffff) {
      diag(diagnostics, primaryFile, `HEX byte address out of range: ${addr}.`);
      continue;
    }
    if (bytes.has(addr)) {
      diag(diagnostics, primaryFile, `HEX data overlaps emitted bytes at address ${addr}.`);
      continue;
    }
    bytes.set(addr, b);
  }

  if (codeOk) writeSection(codeBase, codeBytes, primaryFile);
  if (dataOk) writeSection(dataBase, dataBytes, primaryFile);

  for (const ps of pending) {
    const base = ps.section === 'code' ? codeBase : ps.section === 'data' ? dataBase : varBase;
    const ok = ps.section === 'code' ? codeOk : ps.section === 'data' ? dataOk : varOk;
    if (!ok) continue;
    const sym: SymbolEntry = {
      kind: ps.kind,
      name: ps.name,
      address: base + ps.offset,
      ...(ps.file !== undefined ? { file: ps.file } : {}),
      ...(ps.line !== undefined ? { line: ps.line } : {}),
      ...(ps.scope !== undefined ? { scope: ps.scope } : {}),
      ...(ps.size !== undefined ? { size: ps.size } : {}),
    };
    symbols.push(sym);
  }
  symbols.push(...absoluteSymbols);

  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const addr of bytes.keys()) {
    min = Math.min(min, addr);
    max = Math.max(max, addr);
  }
  const writtenRange =
    Number.isFinite(min) && Number.isFinite(max)
      ? { start: min, end: max + 1 }
      : { start: 0, end: 0 };

  return { map: { bytes, writtenRange }, symbols };
}

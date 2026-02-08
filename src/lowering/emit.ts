import type { Diagnostic } from '../diagnostics/types.js';
import { DiagnosticIds } from '../diagnostics/types.js';
import type { EmittedByteMap, SymbolEntry } from '../formats/types.js';
import type {
  AlignDirectiveNode,
  AsmInstructionNode,
  AsmOperandNode,
  DataBlockNode,
  DataDeclNode,
  EaExprNode,
  EnumDeclNode,
  ExternDeclNode,
  ExternFuncNode,
  FuncDeclNode,
  ImmExprNode,
  ProgramNode,
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
  const symbols: SymbolEntry[] = [];
  const pending: PendingSymbol[] = [];
  const taken = new Set<string>();
  const fixups: { offset: number; baseLower: string; addend: number; file: string }[] = [];

  type Callable =
    | { kind: 'func'; node: FuncDeclNode }
    | { kind: 'extern'; node: ExternFuncNode; address: number };
  const callables = new Map<string, Callable>();

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
    if (seen.has(lower)) return undefined;
    seen.add(lower);
    const decl = env.types.get(typeExpr.name);
    if (!decl) return undefined;
    return resolveScalarKind(decl.typeExpr, seen);
  };

  const storageTypes = new Map<string, TypeExprNode>();
  const stackSlotTypes = new Map<string, TypeExprNode>();
  const stackSlotOffsets = new Map<string, number>();
  let spDeltaTracked = 0;
  let spTrackingValid = true;
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
    if (
      head === 'ld' &&
      operands.length === 2 &&
      operands[0]?.kind === 'Reg' &&
      operands[0].name.toUpperCase() === 'SP'
    ) {
      spTrackingValid = false;
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

  const conditionOpcode = (op: AsmOperandNode): number | undefined => {
    const asName =
      op.kind === 'Imm' && op.expr.kind === 'ImmName'
        ? op.expr.name.toUpperCase()
        : op.kind === 'Reg'
          ? op.name.toUpperCase()
          : undefined;
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

  const resolveRecordType = (te: TypeExprNode): TypeExprNode | undefined => {
    if (te.kind === 'RecordType') return te;
    if (te.kind === 'TypeName') {
      const decl = env.types.get(te.name);
      if (!decl) return undefined;
      return decl.typeExpr;
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
          const record = resolveRecordType(base.typeExpr);
          if (!record || record.kind !== 'RecordType') {
            diagAt(diagnostics, span, `Field access ".${expr.field}" requires a record type.`);
            return undefined;
          }

          let off = 0;
          for (const f of record.fields) {
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
            const sz = sizeOfTypeExpr(f.typeExpr, env, diagnostics);
            if (sz === undefined) return undefined;
            off += sz;
          }
          diagAt(diagnostics, span, `Unknown record field "${expr.field}".`);
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
    if (!r) return false;
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

    // LD r8, (ea)
    if (dst.kind === 'Reg' && src.kind === 'Mem') {
      const d = reg8Code.get(dst.name.toUpperCase());
      if (d !== undefined) {
        if (!materializeEaAddressToHL(src.expr, inst.span)) return false;
        emitCodeBytes(Uint8Array.of(0x46 + (d << 3)), inst.span.file);
        return true;
      }

      const r16 = dst.name.toUpperCase();
      if (r16 === 'HL') {
        if (!materializeEaAddressToHL(src.expr, inst.span)) return false;
        emitCodeBytes(Uint8Array.of(0x7e, 0x23, 0x66, 0x6f), inst.span.file);
        return true;
      }
      if (r16 === 'DE') {
        if (!materializeEaAddressToHL(src.expr, inst.span)) return false;
        emitCodeBytes(Uint8Array.of(0x7e, 0x23, 0x56, 0x5f), inst.span.file);
        return true;
      }
      if (r16 === 'BC') {
        if (!materializeEaAddressToHL(src.expr, inst.span)) return false;
        emitCodeBytes(Uint8Array.of(0x7e, 0x23, 0x46, 0x4f), inst.span.file);
        return true;
      }
    }

    // LD (ea), r8/r16
    if (dst.kind === 'Mem' && src.kind === 'Reg') {
      const s8 = reg8Code.get(src.name.toUpperCase());
      if (s8 !== undefined) {
        if (!materializeEaAddressToHL(dst.expr, inst.span)) return false;
        emitCodeBytes(Uint8Array.of(0x70 + s8), inst.span.file);
        return true;
      }

      const r16 = src.name.toUpperCase();
      if (r16 === 'HL') {
        if (!materializeEaAddressToHL(dst.expr, inst.span)) return false;
        emitCodeBytes(Uint8Array.of(0x75, 0x23, 0x74), inst.span.file);
        return true;
      }
      if (r16 === 'DE') {
        if (!materializeEaAddressToHL(dst.expr, inst.span)) return false;
        emitCodeBytes(Uint8Array.of(0x73, 0x23, 0x72), inst.span.file);
        return true;
      }
      if (r16 === 'BC') {
        if (!materializeEaAddressToHL(dst.expr, inst.span)) return false;
        emitCodeBytes(Uint8Array.of(0x71, 0x23, 0x70), inst.span.file);
        return true;
      }
    }

    return false;
  };

  const firstModule = program.files[0];
  if (!firstModule) {
    diag(diagnostics, program.entryFile, 'No module files to compile.');
    return { map: { bytes }, symbols };
  }

  const primaryFile = firstModule.span.file ?? program.entryFile;

  const alignTo = (n: number, a: number) => (a <= 0 ? n : Math.ceil(n / a) * a);

  // Pre-scan callables for resolution (forward references allowed).
  for (const module of program.files) {
    for (const item of module.items) {
      if (item.kind === 'FuncDecl') {
        const f = item as FuncDeclNode;
        callables.set(f.name.toLowerCase(), { kind: 'func', node: f });
      } else if (item.kind === 'ExternDecl') {
        const ex = item as ExternDeclNode;
        for (const fn of ex.funcs) {
          const addr = evalImmExpr(fn.at, env, diagnostics);
          if (addr === undefined) continue;
          if (addr < 0 || addr > 0xffff) {
            diag(
              diagnostics,
              fn.span.file,
              `extern func "${fn.name}" address out of range (0..65535).`,
            );
            continue;
          }
          callables.set(fn.name.toLowerCase(), { kind: 'extern', node: fn, address: addr });
        }
      } else if (item.kind === 'VarBlock' && item.scope === 'module') {
        const vb = item as VarBlockNode;
        for (const decl of vb.decls) {
          storageTypes.set(decl.name.toLowerCase(), decl.typeExpr);
        }
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
        for (const fn of ex.funcs) {
          if (taken.has(fn.name)) {
            diag(diagnostics, fn.span.file, `Duplicate symbol name "${fn.name}".`);
            continue;
          }
          taken.add(fn.name);
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

      if (item.kind === 'FuncDecl') {
        stackSlotOffsets.clear();
        stackSlotTypes.clear();
        spDeltaTracked = 0;
        spTrackingValid = true;

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

        for (const asmItem of item.asm.items) {
          if (asmItem.kind === 'AsmLabel') {
            if (taken.has(asmItem.name)) {
              diag(diagnostics, asmItem.span.file, `Duplicate symbol name "${asmItem.name}".`);
              continue;
            }
            taken.add(asmItem.name);
            pending.push({
              kind: 'label',
              name: asmItem.name,
              section: 'code',
              offset: codeOffset,
              file: asmItem.span.file,
              line: asmItem.span.start.line,
              scope: 'global',
            });
            continue;
          }
          if (asmItem.kind !== 'AsmInstruction') continue;

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
              continue;
            }

            // Push args right-to-left.
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

            if (!ok) continue;

            // Emit call.
            if (callable.kind === 'extern') {
              emitInstr(
                'call',
                [
                  {
                    kind: 'Imm',
                    span: asmItem.span,
                    expr: { kind: 'ImmLiteral', span: asmItem.span, value: callable.address },
                  },
                ],
                asmItem.span,
              );
            } else {
              emitAbs16Fixup(0xcd, callable.node.name.toLowerCase(), 0, asmItem.span); // call nn
            }

            // Caller cleanup: pop one word per argument.
            for (let k = 0; k < args.length; k++) {
              emitInstr('pop', [{ kind: 'Reg', span: asmItem.span, name: 'BC' }], asmItem.span);
            }

            continue;
          }

          if (asmItem.head.toLowerCase() === 'ret') {
            if (asmItem.operands.length === 0) {
              if (emitSyntheticEpilogue) {
                emitAbs16Fixup(0xc3, epilogueLabel.toLowerCase(), 0, asmItem.span);
                continue;
              }
            }
            if (asmItem.operands.length === 1) {
              const op = conditionOpcode(asmItem.operands[0]!);
              if (op === undefined) {
                diagAt(diagnostics, asmItem.span, `Unsupported ret condition.`);
                continue;
              }
              emitSyntheticEpilogue = true;
              emitAbs16Fixup(op, epilogueLabel.toLowerCase(), 0, asmItem.span);
              continue;
            }
          }

          if (lowerLdWithEa(asmItem)) {
            continue;
          }

          const encoded = encodeInstruction(asmItem, env, diagnostics);
          if (!encoded) continue;
          emitCodeBytes(encoded, asmItem.span.file);
          applySpTracking(asmItem.head, asmItem.operands);
        }

        if (emitSyntheticEpilogue) {
          emitAbs16Fixup(0xc3, epilogueLabel.toLowerCase(), 0, item.span);
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
            elementType === 'word' || elementType === 'addr'
              ? 2
              : elementType === 'byte'
                ? 1
                : undefined;
          if (!elementType || !elementSize) {
            diag(
              diagnostics,
              decl.span.file,
              `Unsupported data type in PR2 subset for "${decl.name}".`,
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

  for (const fx of fixups) {
    const base = addrByNameLower.get(fx.baseLower);
    const addr = base === undefined ? undefined : base + fx.addend;
    if (addr === undefined) {
      diag(diagnostics, fx.file, `Unresolved symbol "${fx.baseLower}" in 16-bit fixup.`);
      continue;
    }
    codeBytes.set(fx.offset, addr & 0xff);
    codeBytes.set(fx.offset + 1, (addr >> 8) & 0xff);
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

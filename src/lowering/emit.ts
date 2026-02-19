import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { Diagnostic, DiagnosticId } from '../diagnostics/types.js';
import { DiagnosticIds } from '../diagnostics/types.js';
import type {
  EmittedAsmTraceEntry,
  EmittedByteMap,
  EmittedSourceSegment,
  SymbolEntry,
} from '../formats/types.js';
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
  ParamNode,
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
import type { OpStackPolicyMode } from '../pipeline.js';

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

function diagAtWithId(
  diagnostics: Diagnostic[],
  span: SourceSpan,
  id: DiagnosticId,
  message: string,
): void {
  diagnostics.push({
    id,
    severity: 'error',
    message,
    file: span.file,
    line: span.start.line,
    column: span.start.column,
  });
}

function diagAtWithSeverityAndId(
  diagnostics: Diagnostic[],
  span: SourceSpan,
  id: DiagnosticId,
  severity: 'error' | 'warning',
  message: string,
): void {
  diagnostics.push({
    id,
    severity,
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
  options?: {
    includeDirs?: string[];
    opStackPolicy?: OpStackPolicyMode;
    rawTypedCallWarnings?: boolean;
    defaultCodeBase?: number;
  },
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
  type SourceSegmentTag = Omit<EmittedSourceSegment, 'start' | 'end'>;
  const codeSourceSegments: EmittedSourceSegment[] = [];
  const codeAsmTrace: EmittedAsmTraceEntry[] = [];
  let currentCodeSegmentTag: SourceSegmentTag | undefined;
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
  type OpStackSummary =
    | { kind: 'known'; delta: number; hasUntrackedSpMutation: boolean }
    | { kind: 'complex' };
  const opStackSummaryCache = new Map<OpDeclNode, OpStackSummary>();
  const opStackPolicyMode = options?.opStackPolicy ?? 'off';
  const rawTypedCallWarningsEnabled = options?.rawTypedCallWarnings === true;
  const declaredOpNames = new Set<string>();
  const declaredBinNames = new Set<string>();

  const reg8 = new Set(['A', 'B', 'C', 'D', 'E', 'H', 'L']);
  const reg16 = new Set(['BC', 'DE', 'HL']);
  const runtimeAtomRegisterNames = new Set([
    'A',
    'B',
    'C',
    'D',
    'E',
    'H',
    'L',
    'HL',
    'DE',
    'BC',
    'SP',
    'IX',
    'IY',
    'IXH',
    'IXL',
    'IYH',
    'IYL',
    'AF',
    "AF'",
    'I',
    'R',
  ]);
  const reg8Code = new Map([
    ['B', 0],
    ['C', 1],
    ['D', 2],
    ['E', 3],
    ['H', 4],
    ['L', 5],
    ['A', 7],
  ]);
  const opStackSummaryKey = (decl: OpDeclNode): string =>
    `${decl.name.toLowerCase()}@${decl.span.file}:${decl.span.start.line}`;
  const summarizeOpStackEffect = (
    decl: OpDeclNode,
    visiting: Set<string> = new Set(),
  ): OpStackSummary => {
    const cached = opStackSummaryCache.get(decl);
    if (cached) return cached;
    const key = opStackSummaryKey(decl);
    if (visiting.has(key)) return { kind: 'complex' };
    visiting.add(key);
    let delta = 0;
    let hasUntrackedSpMutation = false;
    let complex = false;
    for (const item of decl.body.items) {
      if (item.kind === 'AsmLabel') continue;
      if (item.kind !== 'AsmInstruction') {
        complex = true;
        break;
      }
      const head = item.head.toLowerCase();
      const operands = item.operands;
      if (head === 'push' && operands.length === 1) {
        delta -= 2;
        continue;
      }
      if (head === 'pop' && operands.length === 1) {
        delta += 2;
        continue;
      }
      if (
        head === 'inc' &&
        operands.length === 1 &&
        operands[0]?.kind === 'Reg' &&
        operands[0].name.toUpperCase() === 'SP'
      ) {
        delta += 1;
        continue;
      }
      if (
        head === 'dec' &&
        operands.length === 1 &&
        operands[0]?.kind === 'Reg' &&
        operands[0].name.toUpperCase() === 'SP'
      ) {
        delta -= 1;
        continue;
      }
      if (
        head === 'ld' &&
        operands.length === 2 &&
        operands[0]?.kind === 'Reg' &&
        operands[0].name.toUpperCase() === 'SP'
      ) {
        hasUntrackedSpMutation = true;
        continue;
      }
      if (
        head === 'ret' ||
        head === 'retn' ||
        head === 'reti' ||
        head === 'jp' ||
        head === 'jr' ||
        head === 'djnz'
      ) {
        complex = true;
        break;
      }
      const nestedCandidates = opsByName.get(head);
      if (nestedCandidates && nestedCandidates.length > 0) {
        if (nestedCandidates.length !== 1) {
          complex = true;
          break;
        }
        const nested = summarizeOpStackEffect(nestedCandidates[0]!, visiting);
        if (nested.kind !== 'known') {
          complex = true;
          break;
        }
        delta += nested.delta;
        hasUntrackedSpMutation = hasUntrackedSpMutation || nested.hasUntrackedSpMutation;
      }
    }
    visiting.delete(key);
    const out: OpStackSummary = complex
      ? { kind: 'complex' }
      : { kind: 'known', delta, hasUntrackedSpMutation };
    opStackSummaryCache.set(decl, out);
    return out;
  };

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
  const moduleAliasTargets = new Map<string, EaExprNode>();
  const moduleAliasDecls = new Map<string, VarDeclNode>();
  const rawAddressSymbols = new Set<string>();
  const stackSlotTypes = new Map<string, TypeExprNode>();
  const stackSlotOffsets = new Map<string, number>();
  let localAliasTargets = new Map<string, EaExprNode>();
  let spDeltaTracked = 0;
  let spTrackingValid = true;
  let spTrackingInvalidatedByMutation = false;
  let generatedLabelCounter = 0;

  type EaResolution =
    | { kind: 'abs'; baseLower: string; addend: number; typeExpr?: TypeExprNode }
    | { kind: 'stack'; ixDisp: number; typeExpr?: TypeExprNode };

  const sameSourceTag = (x: SourceSegmentTag, y: SourceSegmentTag): boolean =>
    x.file === y.file &&
    x.line === y.line &&
    x.column === y.column &&
    x.kind === y.kind &&
    x.confidence === y.confidence;

  const recordCodeSourceRange = (start: number, end: number): void => {
    if (!currentCodeSegmentTag || end <= start) return;
    const last = codeSourceSegments[codeSourceSegments.length - 1];
    if (last && last.end === start && sameSourceTag(last, currentCodeSegmentTag)) {
      last.end = end;
      return;
    }
    codeSourceSegments.push({ ...currentCodeSegmentTag, start, end });
  };

  const toHexByte = (n: number): string =>
    `$${(n & 0xff).toString(16).toUpperCase().padStart(2, '0')}`;
  const toHexWord = (n: number): string =>
    `$${(n & 0xffff).toString(16).toUpperCase().padStart(4, '0')}`;

  const formatImmExprForAsm = (expr: ImmExprNode): string => {
    switch (expr.kind) {
      case 'ImmLiteral':
        return toHexWord(expr.value);
      case 'ImmName':
        return expr.name;
      case 'ImmSizeof':
        return 'sizeof(...)';
      case 'ImmOffsetof':
        return 'offsetof(...)';
      case 'ImmUnary':
        return `${expr.op}${formatImmExprForAsm(expr.expr)}`;
      case 'ImmBinary':
        return `${formatImmExprForAsm(expr.left)} ${expr.op} ${formatImmExprForAsm(expr.right)}`;
      default:
        return 'imm';
    }
  };

  const formatEaExprForAsm = (ea: EaExprNode): string => {
    switch (ea.kind) {
      case 'EaName':
        return ea.name;
      case 'EaField':
        return `${formatEaExprForAsm(ea.base)}.${ea.field}`;
      case 'EaAdd':
        return `${formatEaExprForAsm(ea.base)} + ${formatImmExprForAsm(ea.offset)}`;
      case 'EaSub':
        return `${formatEaExprForAsm(ea.base)} - ${formatImmExprForAsm(ea.offset)}`;
      case 'EaIndex': {
        let idx = '';
        switch (ea.index.kind) {
          case 'IndexImm':
            idx = formatImmExprForAsm(ea.index.value);
            break;
          case 'IndexReg8':
          case 'IndexReg16':
            idx = ea.index.reg;
            break;
          case 'IndexMemHL':
            idx = '(HL)';
            break;
          case 'IndexMemIxIy':
            idx = ea.index.disp
              ? `${ea.index.base}${ea.index.disp.kind === 'ImmUnary' ? '' : '+'}${formatImmExprForAsm(ea.index.disp)}`
              : ea.index.base;
            break;
          case 'IndexEa':
            idx = formatEaExprForAsm(ea.index.expr);
            break;
        }
        return `${formatEaExprForAsm(ea.base)}[${idx}]`;
      }
      default:
        return 'ea';
    }
  };

  const formatAsmOperandForTrace = (operand: AsmOperandNode): string => {
    switch (operand.kind) {
      case 'Reg':
        return operand.name;
      case 'Imm':
        return formatImmExprForAsm(operand.expr);
      case 'Ea':
        return formatEaExprForAsm(operand.expr);
      case 'Mem':
        return `(${formatEaExprForAsm(operand.expr)})`;
      case 'PortC':
        return '(C)';
      case 'PortImm8':
        return `(${formatImmExprForAsm(operand.expr)})`;
      default:
        return '?';
    }
  };

  const formatAsmInstrForTrace = (head: string, operands: AsmOperandNode[]): string => {
    const lowerHead = head.toLowerCase();
    if (operands.length === 0) return lowerHead;
    return `${lowerHead} ${operands.map(formatAsmOperandForTrace).join(', ')}`;
  };

  const formatFixupSymbolExpr = (baseLower: string, addend: number): string => {
    if (addend === 0) return baseLower;
    if (addend > 0) return `${baseLower} + ${addend}`;
    return `${baseLower} - ${Math.abs(addend)}`;
  };

  const jpCondFromOpcode = (opcode: number): string | undefined => {
    switch (opcode & 0xff) {
      case 0xc2:
        return 'NZ';
      case 0xca:
        return 'Z';
      case 0xd2:
        return 'NC';
      case 0xda:
        return 'C';
      case 0xe2:
        return 'PO';
      case 0xea:
        return 'PE';
      case 0xf2:
        return 'P';
      case 0xfa:
        return 'M';
      default:
        return undefined;
    }
  };

  const callCondFromOpcode = (opcode: number): string | undefined => {
    switch (opcode & 0xff) {
      case 0xc4:
        return 'NZ';
      case 0xcc:
        return 'Z';
      case 0xd4:
        return 'NC';
      case 0xdc:
        return 'C';
      case 0xe4:
        return 'PO';
      case 0xec:
        return 'PE';
      case 0xf4:
        return 'P';
      case 0xfc:
        return 'M';
      default:
        return undefined;
    }
  };

  const formatAbs16FixupAsm = (opcode: number, baseLower: string, addend: number): string => {
    const sym = formatFixupSymbolExpr(baseLower, addend);
    switch (opcode & 0xff) {
      case 0x01:
        return `ld BC, ${sym}`;
      case 0x11:
        return `ld DE, ${sym}`;
      case 0x21:
        return `ld HL, ${sym}`;
      case 0x31:
        return `ld SP, ${sym}`;
      case 0x2a:
        return `ld HL, (${sym})`;
      case 0x3a:
        return `ld A, (${sym})`;
      case 0x22:
        return `ld (${sym}), HL`;
      case 0x32:
        return `ld (${sym}), A`;
      case 0xc3:
        return `jp ${sym}`;
      case 0xcd:
        return `call ${sym}`;
      default: {
        const jpCc = jpCondFromOpcode(opcode);
        if (jpCc) return `jp ${jpCc}, ${sym}`;
        const callCc = callCondFromOpcode(opcode);
        if (callCc) return `call ${callCc}, ${sym}`;
        return `db ${toHexByte(opcode)}, lo(${baseLower}), hi(${baseLower})`;
      }
    }
  };

  const formatAbs16FixupEdAsm = (opcode2: number, baseLower: string, addend: number): string => {
    const sym = formatFixupSymbolExpr(baseLower, addend);
    switch (opcode2 & 0xff) {
      case 0x4b:
        return `ld BC, (${sym})`;
      case 0x5b:
        return `ld DE, (${sym})`;
      case 0x7b:
        return `ld SP, (${sym})`;
      case 0x43:
        return `ld (${sym}), BC`;
      case 0x53:
        return `ld (${sym}), DE`;
      case 0x73:
        return `ld (${sym}), SP`;
      default:
        return `db $ED, ${toHexByte(opcode2)}, lo(${baseLower}), hi(${baseLower})`;
    }
  };

  const formatAbs16FixupPrefixedAsm = (
    prefix: number,
    opcode2: number,
    baseLower: string,
    addend: number,
  ): string => {
    const sym = formatFixupSymbolExpr(baseLower, addend);
    const reg16 = prefix === 0xdd ? 'IX' : prefix === 0xfd ? 'IY' : undefined;
    if (!reg16) {
      return `db ${toHexByte(prefix)}, ${toHexByte(opcode2)}, lo(${baseLower}), hi(${baseLower})`;
    }
    switch (opcode2 & 0xff) {
      case 0x21:
        return `ld ${reg16}, ${sym}`;
      case 0x2a:
        return `ld ${reg16}, (${sym})`;
      case 0x22:
        return `ld (${sym}), ${reg16}`;
      default:
        return `db ${toHexByte(prefix)}, ${toHexByte(opcode2)}, lo(${baseLower}), hi(${baseLower})`;
    }
  };

  const traceInstruction = (offset: number, bytesOut: Uint8Array, text: string): void => {
    if (bytesOut.length === 0) return;
    codeAsmTrace.push({
      kind: 'instruction',
      offset,
      text,
      bytes: [...bytesOut],
    });
  };

  const traceLabel = (offset: number, name: string): void => {
    codeAsmTrace.push({ kind: 'label', offset, name });
  };

  const traceComment = (offset: number, text: string): void => {
    codeAsmTrace.push({ kind: 'comment', offset, text });
  };

  const emitCodeBytes = (bs: Uint8Array, file: string) => {
    const start = codeOffset;
    for (const b of bs) {
      codeBytes.set(codeOffset, b);
      codeOffset++;
    }
    recordCodeSourceRange(start, codeOffset);
  };

  const emitRawCodeBytes = (bs: Uint8Array, file: string, traceText: string): void => {
    const start = codeOffset;
    emitCodeBytes(bs, file);
    traceInstruction(start, bs, traceText);
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
    const start = codeOffset;
    const encoded = encodeInstruction(
      { kind: 'AsmInstruction', span, head, operands } as any,
      env,
      diagnostics,
    );
    if (!encoded) return false;
    emitCodeBytes(encoded, span.file);
    traceInstruction(start, encoded, formatAsmInstrForTrace(head, operands));
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

  const loadImm16ToDE = (n: number, span: any): boolean => {
    return emitInstr(
      'ld',
      [
        { kind: 'Reg', span, name: 'DE' },
        { kind: 'Imm', span, expr: { kind: 'ImmLiteral', span, value: n } },
      ],
      span,
    );
  };

  const negateHL = (span: SourceSpan): boolean => {
    if (
      !emitInstr(
        'ld',
        [
          { kind: 'Reg', span, name: 'A' },
          { kind: 'Reg', span, name: 'H' },
        ],
        span,
      )
    ) {
      return false;
    }
    if (!emitInstr('cpl', [], span)) return false;
    if (
      !emitInstr(
        'ld',
        [
          { kind: 'Reg', span, name: 'H' },
          { kind: 'Reg', span, name: 'A' },
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
          { kind: 'Reg', span, name: 'A' },
          { kind: 'Reg', span, name: 'L' },
        ],
        span,
      )
    ) {
      return false;
    }
    if (!emitInstr('cpl', [], span)) return false;
    if (
      !emitInstr(
        'ld',
        [
          { kind: 'Reg', span, name: 'L' },
          { kind: 'Reg', span, name: 'A' },
        ],
        span,
      )
    ) {
      return false;
    }
    return emitInstr('inc', [{ kind: 'Reg', span, name: 'HL' }], span);
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
    asmText?: string,
  ): void => {
    const start = codeOffset;
    codeBytes.set(codeOffset++, opcode);
    codeBytes.set(codeOffset++, 0x00);
    codeBytes.set(codeOffset++, 0x00);
    recordCodeSourceRange(start, codeOffset);
    fixups.push({ offset: start + 1, baseLower, addend, file: span.file });
    traceInstruction(
      start,
      Uint8Array.of(opcode, 0x00, 0x00),
      asmText ?? formatAbs16FixupAsm(opcode, baseLower, addend),
    );
  };

  const emitAbs16FixupEd = (
    opcode2: number,
    baseLower: string,
    addend: number,
    span: SourceSpan,
    asmText?: string,
  ): void => {
    const start = codeOffset;
    codeBytes.set(codeOffset++, 0xed);
    codeBytes.set(codeOffset++, opcode2);
    codeBytes.set(codeOffset++, 0x00);
    codeBytes.set(codeOffset++, 0x00);
    recordCodeSourceRange(start, codeOffset);
    fixups.push({ offset: start + 2, baseLower, addend, file: span.file });
    traceInstruction(
      start,
      Uint8Array.of(0xed, opcode2, 0x00, 0x00),
      asmText ?? formatAbs16FixupEdAsm(opcode2, baseLower, addend),
    );
  };

  const emitAbs16FixupPrefixed = (
    prefix: number,
    opcode2: number,
    baseLower: string,
    addend: number,
    span: SourceSpan,
    asmText?: string,
  ): void => {
    const start = codeOffset;
    codeBytes.set(codeOffset++, prefix);
    codeBytes.set(codeOffset++, opcode2);
    codeBytes.set(codeOffset++, 0x00);
    codeBytes.set(codeOffset++, 0x00);
    recordCodeSourceRange(start, codeOffset);
    fixups.push({ offset: start + 2, baseLower, addend, file: span.file });
    traceInstruction(
      start,
      Uint8Array.of(prefix, opcode2, 0x00, 0x00),
      asmText ?? formatAbs16FixupPrefixedAsm(prefix, opcode2, baseLower, addend),
    );
  };

  const emitRel8Fixup = (
    opcode: number,
    baseLower: string,
    addend: number,
    span: SourceSpan,
    mnemonic: string,
    asmText?: string,
  ): void => {
    const start = codeOffset;
    codeBytes.set(codeOffset++, opcode);
    codeBytes.set(codeOffset++, 0x00);
    recordCodeSourceRange(start, codeOffset);
    rel8Fixups.push({
      offset: start + 1,
      origin: start + 2,
      baseLower,
      addend,
      file: span.file,
      mnemonic,
    });
    traceInstruction(start, Uint8Array.of(opcode, 0x00), asmText ?? `${mnemonic} ${baseLower}`);
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
  const conditionNameFromOpcode = (opcode: number): string | undefined => {
    switch (opcode) {
      case 0xc2:
        return 'NZ';
      case 0xca:
        return 'Z';
      case 0xd2:
        return 'NC';
      case 0xda:
        return 'C';
      case 0xe2:
        return 'PO';
      case 0xea:
        return 'PE';
      case 0xf2:
        return 'P';
      case 0xfa:
        return 'M';
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

  const flattenEaDottedName = (ea: EaExprNode): string | undefined => {
    if (ea.kind === 'EaName') return ea.name;
    if (ea.kind === 'EaField') {
      const base = flattenEaDottedName(ea.base);
      return base ? `${base}.${ea.field}` : undefined;
    }
    return undefined;
  };

  const enumImmExprFromOperand = (op: AsmOperandNode): ImmExprNode | undefined => {
    if (op.kind === 'Imm') return op.expr;
    if (op.kind !== 'Ea') return undefined;
    const name = flattenEaDottedName(op.expr);
    if (!name || !env.enums.has(name)) return undefined;
    return { kind: 'ImmName', span: op.span, name };
  };

  const normalizeFixedToken = (op: AsmOperandNode): string | undefined => {
    switch (op.kind) {
      case 'Reg':
        return op.name.toUpperCase();
      case 'Imm':
        if (op.expr.kind === 'ImmName') return op.expr.name.toUpperCase();
        return undefined;
      case 'Ea': {
        const enumExpr = enumImmExprFromOperand(op);
        return enumExpr?.kind === 'ImmName' ? enumExpr.name.toUpperCase() : undefined;
      }
      default:
        return undefined;
    }
  };

  const fitsImm8 = (value: number): boolean => value >= -0x80 && value <= 0xff;
  const fitsImm16 = (value: number): boolean => value >= -0x8000 && value <= 0xffff;
  const evalImmNoDiag = (expr: ImmExprNode): number | undefined => {
    const scratch: Diagnostic[] = [];
    return evalImmExpr(expr, env, scratch);
  };
  const isIxIyIndexedMem = (op: AsmOperandNode): boolean =>
    op.kind === 'Mem' &&
    ((op.expr.kind === 'EaName' && /^(IX|IY)$/i.test(op.expr.name)) ||
      ((op.expr.kind === 'EaAdd' || op.expr.kind === 'EaSub') &&
        op.expr.base.kind === 'EaName' &&
        /^(IX|IY)$/i.test(op.expr.base.name)));
  const inferMemWidth = (op: AsmOperandNode): number | undefined => {
    if (op.kind !== 'Mem') return undefined;
    const resolved = resolveEa(op.expr, op.span);
    if (!resolved?.typeExpr) return undefined;
    return sizeOfTypeExpr(resolved.typeExpr, env, diagnostics);
  };

  const matcherMatchesOperand = (matcher: OpMatcherNode, operand: AsmOperandNode): boolean => {
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
      case 'MatcherIdx16':
        return isIxIyIndexedMem(operand);
      case 'MatcherCc': {
        const token = normalizeFixedToken(operand);
        return token !== undefined && conditionOpcodeFromName(token) !== undefined;
      }
      case 'MatcherImm8': {
        const expr = enumImmExprFromOperand(operand);
        if (!expr) return false;
        const v = evalImmNoDiag(expr);
        return v !== undefined && fitsImm8(v);
      }
      case 'MatcherImm16': {
        const expr = enumImmExprFromOperand(operand);
        if (!expr) return false;
        const v = evalImmNoDiag(expr);
        return v !== undefined && fitsImm16(v);
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

  const fixedTokenBeatsClassMatcher = (
    fixed: Extract<OpMatcherNode, { kind: 'MatcherFixed' }>,
    other: OpMatcherNode,
    operand: AsmOperandNode,
  ): boolean => {
    const fixedToken = fixed.token.toUpperCase();
    switch (other.kind) {
      case 'MatcherReg8':
        return (
          operand.kind === 'Reg' &&
          operand.name.toUpperCase() === fixedToken &&
          reg8.has(fixedToken)
        );
      case 'MatcherReg16':
        return (
          operand.kind === 'Reg' &&
          operand.name.toUpperCase() === fixedToken &&
          (fixedToken === 'BC' || fixedToken === 'DE' || fixedToken === 'HL' || fixedToken === 'SP')
        );
      case 'MatcherCc':
        return conditionOpcodeFromName(fixedToken) !== undefined;
      default:
        return false;
    }
  };

  type MatcherSpecificity = 'x_more_specific' | 'y_more_specific' | 'equal';

  const compareMatcherSpecificity = (
    matcherX: OpMatcherNode,
    matcherY: OpMatcherNode,
    operand: AsmOperandNode,
  ): MatcherSpecificity => {
    if (matcherX.kind === matcherY.kind) {
      if (matcherX.kind === 'MatcherFixed' && matcherY.kind === 'MatcherFixed') {
        return matcherX.token.toUpperCase() === matcherY.token.toUpperCase() ? 'equal' : 'equal';
      }
      return 'equal';
    }

    if (
      matcherX.kind === 'MatcherFixed' &&
      fixedTokenBeatsClassMatcher(matcherX, matcherY, operand)
    ) {
      return 'x_more_specific';
    }
    if (
      matcherY.kind === 'MatcherFixed' &&
      fixedTokenBeatsClassMatcher(matcherY, matcherX, operand)
    ) {
      return 'y_more_specific';
    }

    if (matcherX.kind === 'MatcherImm8' && matcherY.kind === 'MatcherImm16') {
      const expr = enumImmExprFromOperand(operand);
      if (!expr) return 'equal';
      const value = evalImmNoDiag(expr);
      return value !== undefined && fitsImm8(value) ? 'x_more_specific' : 'equal';
    }
    if (matcherX.kind === 'MatcherImm16' && matcherY.kind === 'MatcherImm8') {
      const expr = enumImmExprFromOperand(operand);
      if (!expr) return 'equal';
      const value = evalImmNoDiag(expr);
      return value !== undefined && fitsImm8(value) ? 'y_more_specific' : 'equal';
    }

    if (
      (matcherX.kind === 'MatcherMem8' || matcherX.kind === 'MatcherMem16') &&
      matcherY.kind === 'MatcherEa' &&
      operand.kind === 'Mem'
    ) {
      return 'x_more_specific';
    }
    if (
      matcherX.kind === 'MatcherEa' &&
      (matcherY.kind === 'MatcherMem8' || matcherY.kind === 'MatcherMem16') &&
      operand.kind === 'Mem'
    ) {
      return 'y_more_specific';
    }

    if (
      (matcherX.kind === 'MatcherMem8' && matcherY.kind === 'MatcherMem16') ||
      (matcherX.kind === 'MatcherMem16' && matcherY.kind === 'MatcherMem8')
    ) {
      return 'equal';
    }

    return 'equal';
  };

  type OverloadSpecificity = 'x_wins' | 'y_wins' | 'equal' | 'incomparable';

  const compareOpOverloadSpecificity = (
    overloadX: OpDeclNode,
    overloadY: OpDeclNode,
    operands: AsmOperandNode[],
  ): OverloadSpecificity => {
    let xBetter = 0;
    let yBetter = 0;
    for (let i = 0; i < operands.length; i++) {
      const xMatcher = overloadX.params[i]!.matcher;
      const yMatcher = overloadY.params[i]!.matcher;
      const cmp = compareMatcherSpecificity(xMatcher, yMatcher, operands[i]!);
      if (cmp === 'x_more_specific') xBetter++;
      if (cmp === 'y_more_specific') yBetter++;
    }
    if (xBetter > 0 && yBetter === 0) return 'x_wins';
    if (yBetter > 0 && xBetter === 0) return 'y_wins';
    if (xBetter === 0 && yBetter === 0) return 'equal';
    return 'incomparable';
  };

  const selectMostSpecificOpOverload = (
    candidates: OpDeclNode[],
    operands: AsmOperandNode[],
  ): OpDeclNode | undefined => {
    if (candidates.length === 0) return undefined;
    if (candidates.length === 1) return candidates[0]!;
    for (let i = 0; i < candidates.length; i++) {
      const candidate = candidates[i]!;
      let beatsAll = true;
      for (let j = 0; j < candidates.length; j++) {
        if (i === j) continue;
        const cmp = compareOpOverloadSpecificity(candidate, candidates[j]!, operands);
        if (cmp !== 'x_wins') {
          beatsAll = false;
          break;
        }
      }
      if (beatsAll) return candidate;
    }
    return undefined;
  };

  const formatOpMatcher = (matcher: OpMatcherNode): string => {
    switch (matcher.kind) {
      case 'MatcherReg8':
        return 'reg8';
      case 'MatcherReg16':
        return 'reg16';
      case 'MatcherIdx16':
        return 'idx16';
      case 'MatcherCc':
        return 'cc';
      case 'MatcherImm8':
        return 'imm8';
      case 'MatcherImm16':
        return 'imm16';
      case 'MatcherEa':
        return 'ea';
      case 'MatcherMem8':
        return 'mem8';
      case 'MatcherMem16':
        return 'mem16';
      case 'MatcherFixed':
        return matcher.token;
      default:
        return 'unknown';
    }
  };

  const formatImmExprForOpDiag = (expr: ImmExprNode): string => {
    switch (expr.kind) {
      case 'ImmLiteral':
        return String(expr.value);
      case 'ImmName':
        return expr.name;
      case 'ImmSizeof':
        return 'sizeof(...)';
      case 'ImmOffsetof':
        return 'offsetof(...)';
      case 'ImmUnary':
        return `${expr.op}${formatImmExprForOpDiag(expr.expr)}`;
      case 'ImmBinary':
        return `${formatImmExprForOpDiag(expr.left)} ${expr.op} ${formatImmExprForOpDiag(expr.right)}`;
      default:
        return 'imm';
    }
  };

  const formatEaExprForOpDiag = (ea: EaExprNode): string => {
    switch (ea.kind) {
      case 'EaName':
        return ea.name;
      case 'EaField':
        return `${formatEaExprForOpDiag(ea.base)}.${ea.field}`;
      case 'EaAdd':
        return `${formatEaExprForOpDiag(ea.base)} + ${formatImmExprForOpDiag(ea.offset)}`;
      case 'EaSub':
        return `${formatEaExprForOpDiag(ea.base)} - ${formatImmExprForOpDiag(ea.offset)}`;
      case 'EaIndex': {
        let idx = '';
        switch (ea.index.kind) {
          case 'IndexImm':
            idx = formatImmExprForOpDiag(ea.index.value);
            break;
          case 'IndexReg8':
          case 'IndexReg16':
            idx = ea.index.reg;
            break;
          case 'IndexMemHL':
            idx = '(HL)';
            break;
          case 'IndexMemIxIy':
            idx = ea.index.disp
              ? `${ea.index.base}${ea.index.disp.kind === 'ImmUnary' ? '' : '+'}${formatImmExprForOpDiag(ea.index.disp)}`
              : ea.index.base;
            break;
          case 'IndexEa':
            idx = formatEaExprForOpDiag(ea.index.expr);
            break;
        }
        return `${formatEaExprForOpDiag(ea.base)}[${idx}]`;
      }
      default:
        return 'ea';
    }
  };

  const formatAsmOperandForOpDiag = (operand: AsmOperandNode): string => {
    switch (operand.kind) {
      case 'Reg':
        return operand.name;
      case 'Imm':
        return formatImmExprForOpDiag(operand.expr);
      case 'Ea':
        return formatEaExprForOpDiag(operand.expr);
      case 'Mem':
        return `(${formatEaExprForOpDiag(operand.expr)})`;
      case 'PortC':
        return '(C)';
      case 'PortImm8':
        return `(${formatImmExprForOpDiag(operand.expr)})`;
      default:
        return '?';
    }
  };

  const formatOpSignature = (opDecl: OpDeclNode): string => {
    const params = opDecl.params.map((p) => `${p.name}: ${formatOpMatcher(p.matcher)}`).join(', ');
    return `${opDecl.name}(${params})`;
  };

  const formatOpDefinitionForDiag = (opDecl: OpDeclNode): string =>
    `${formatOpSignature(opDecl)} (${opDecl.span.file}:${opDecl.span.start.line})`;

  const matcherMismatchReason = (matcher: OpMatcherNode, operand: AsmOperandNode): string => {
    const got = formatAsmOperandForOpDiag(operand);
    switch (matcher.kind) {
      case 'MatcherReg8':
        return `expects reg8, got ${got}`;
      case 'MatcherReg16':
        return `expects reg16, got ${got}`;
      case 'MatcherIdx16':
        return `expects IX/IY indexed memory operand, got ${got}`;
      case 'MatcherCc':
        return `expects condition token NZ/Z/NC/C/PO/PE/P/M, got ${got}`;
      case 'MatcherImm8': {
        const expr = enumImmExprFromOperand(operand);
        if (!expr) return `expects imm8, got ${got}`;
        const value = evalImmNoDiag(expr);
        if (value === undefined) return `expects imm8, got ${got}`;
        if (!fitsImm8(value)) return `expects imm8 (-128..255), got ${got}`;
        return `expects imm8, got ${got}`;
      }
      case 'MatcherImm16': {
        const expr = enumImmExprFromOperand(operand);
        if (!expr) return `expects imm16, got ${got}`;
        const value = evalImmNoDiag(expr);
        if (value === undefined) return `expects imm16, got ${got}`;
        if (!fitsImm16(value)) return `expects imm16 (-32768..65535), got ${got}`;
        return `expects imm16, got ${got}`;
      }
      case 'MatcherEa':
        return `expects ea, got ${got}`;
      case 'MatcherMem8': {
        if (operand.kind !== 'Mem') return `expects mem8 dereference, got ${got}`;
        const width = inferMemWidth(operand);
        if (width !== undefined && width !== 1)
          return `expects mem8 dereference, got mem${width * 8}`;
        return `expects mem8 dereference, got ${got}`;
      }
      case 'MatcherMem16': {
        if (operand.kind !== 'Mem') return `expects mem16 dereference, got ${got}`;
        const width = inferMemWidth(operand);
        if (width !== undefined && width !== 2)
          return `expects mem16 dereference, got mem${width * 8}`;
        return `expects mem16 dereference, got ${got}`;
      }
      case 'MatcherFixed':
        return `expects ${matcher.token}, got ${got}`;
      default:
        return `operand mismatch: expected ${formatOpMatcher(matcher)}, got ${got}`;
    }
  };

  const firstOpOverloadMismatchReason = (
    opDecl: OpDeclNode,
    operands: AsmOperandNode[],
  ): string | undefined => {
    for (let i = 0; i < opDecl.params.length && i < operands.length; i++) {
      const param = opDecl.params[i]!;
      const operand = operands[i]!;
      if (matcherMatchesOperand(param.matcher, operand)) continue;
      return `${param.name}: ${matcherMismatchReason(param.matcher, operand)}`;
    }
    return undefined;
  };

  const cloneImmExpr = (expr: ImmExprNode): ImmExprNode => {
    const cloneOffsetofPath = (path: any): any => ({
      ...path,
      steps: path.steps.map((step: any) =>
        step.kind === 'OffsetofIndex' ? { ...step, expr: cloneImmExpr(step.expr) } : { ...step },
      ),
    });
    if (expr.kind === 'ImmLiteral') return { ...expr };
    if (expr.kind === 'ImmName') return { ...expr };
    if (expr.kind === 'ImmSizeof') return { ...expr };
    if (expr.kind === 'ImmOffsetof')
      return { ...expr, path: cloneOffsetofPath(expr.path) as typeof expr.path };
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
                : ea.index.kind === 'IndexMemIxIy' && ea.index.disp
                  ? { ...ea.index, disp: cloneImmExpr(ea.index.disp) }
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

  const resolveArrayElementType = (te: TypeExprNode): TypeExprNode | undefined => {
    if (te.kind === 'ArrayType') return te.element;
    if (te.kind === 'TypeName') {
      const decl = env.types.get(te.name);
      if (decl?.kind === 'TypeDecl' && decl.typeExpr.kind === 'ArrayType') {
        return decl.typeExpr.element;
      }
    }
    return undefined;
  };

  const unwrapTypeAlias = (
    te: TypeExprNode,
    seen = new Set<string>(),
  ): TypeExprNode | undefined => {
    if (te.kind !== 'TypeName') return te;
    const scalar = resolveScalarKind(te);
    if (scalar)
      return { kind: 'TypeName', span: te.span, name: scalar === 'addr' ? 'addr' : scalar };
    const lower = te.name.toLowerCase();
    if (seen.has(lower)) return undefined;
    seen.add(lower);
    const decl = env.types.get(te.name);
    if (!decl || decl.kind !== 'TypeDecl') return te;
    return unwrapTypeAlias(decl.typeExpr, seen);
  };

  const resolveArrayType = (
    te: TypeExprNode,
  ): { element: TypeExprNode; length?: number } | undefined => {
    const resolved = unwrapTypeAlias(te);
    if (!resolved || resolved.kind !== 'ArrayType') return undefined;
    return resolved.length === undefined
      ? { element: resolved.element }
      : { element: resolved.element, length: resolved.length };
  };

  const typeDisplay = (te: TypeExprNode): string => {
    const render = (x: TypeExprNode): string => {
      if (x.kind === 'TypeName') return x.name;
      if (x.kind === 'ArrayType') {
        const inner = render(x.element);
        return `${inner}[${x.length === undefined ? '' : x.length}]`;
      }
      if (x.kind === 'RecordType') {
        return `record{${x.fields.map((f) => `${f.name}:${render(f.typeExpr)}`).join(',')}}`;
      }
      return 'type';
    };
    return render(te);
  };

  const sameTypeShape = (left: TypeExprNode, right: TypeExprNode): boolean => {
    const l = unwrapTypeAlias(left);
    const r = unwrapTypeAlias(right);
    if (!l || !r) return false;
    if (l.kind !== r.kind) return false;
    switch (l.kind) {
      case 'TypeName':
        return r.kind === 'TypeName' && l.name.toLowerCase() === r.name.toLowerCase();
      case 'ArrayType':
        if (r.kind !== 'ArrayType') return false;
        if (l.length !== r.length) return false;
        return sameTypeShape(l.element, r.element);
      case 'RecordType':
        if (r.kind !== 'RecordType') return false;
        if (l.fields.length !== r.fields.length) return false;
        for (let i = 0; i < l.fields.length; i++) {
          const lf = l.fields[i]!;
          const rf = r.fields[i]!;
          if (lf.name !== rf.name || !sameTypeShape(lf.typeExpr, rf.typeExpr)) return false;
        }
        return true;
    }
  };

  const resolveEaBaseName = (ea: EaExprNode): string | undefined => {
    switch (ea.kind) {
      case 'EaName':
        return ea.name;
      case 'EaField':
      case 'EaIndex':
      case 'EaAdd':
      case 'EaSub':
        return resolveEaBaseName(ea.base);
    }
  };

  const resolveAliasTarget = (nameLower: string): EaExprNode | undefined =>
    localAliasTargets.get(nameLower) ?? moduleAliasTargets.get(nameLower);

  const resolveEaTypeExprInternal = (
    ea: EaExprNode,
    visitingAliases: Set<string>,
  ): TypeExprNode | undefined => {
    switch (ea.kind) {
      case 'EaName': {
        const lower = ea.name.toLowerCase();
        const direct = stackSlotTypes.get(lower) ?? storageTypes.get(lower);
        if (direct) return direct;
        const aliasTarget = resolveAliasTarget(lower);
        if (!aliasTarget) return undefined;
        if (visitingAliases.has(lower)) return undefined;
        visitingAliases.add(lower);
        try {
          return resolveEaTypeExprInternal(aliasTarget, visitingAliases);
        } finally {
          visitingAliases.delete(lower);
        }
      }
      case 'EaAdd':
      case 'EaSub':
        return resolveEaTypeExprInternal(ea.base, visitingAliases);
      case 'EaField': {
        const baseType = resolveEaTypeExprInternal(ea.base, visitingAliases);
        if (!baseType) return undefined;
        const agg = resolveAggregateType(baseType);
        if (!agg) return undefined;
        for (const f of agg.fields) {
          if (f.name === ea.field) return f.typeExpr;
        }
        return undefined;
      }
      case 'EaIndex': {
        const baseType = resolveEaTypeExprInternal(ea.base, visitingAliases);
        if (!baseType) return undefined;
        return resolveArrayElementType(baseType);
      }
    }
  };

  const resolveEaTypeExpr = (ea: EaExprNode): TypeExprNode | undefined =>
    resolveEaTypeExprInternal(ea, new Set<string>());

  const resolveScalarBinding = (name: string): 'byte' | 'word' | 'addr' | undefined => {
    const lower = name.toLowerCase();
    if (rawAddressSymbols.has(lower)) return undefined;
    const typeExpr =
      stackSlotTypes.get(lower) ??
      storageTypes.get(lower) ??
      (() => {
        const aliasTarget = resolveAliasTarget(lower);
        if (!aliasTarget) return undefined;
        return resolveEaTypeExpr(aliasTarget);
      })();
    if (!typeExpr) return undefined;
    return resolveScalarKind(typeExpr);
  };

  const resolveScalarTypeForEa = (ea: EaExprNode): 'byte' | 'word' | 'addr' | undefined => {
    const base = resolveEaBaseName(ea);
    if (base && rawAddressSymbols.has(base.toLowerCase())) return undefined;
    const typeExpr = resolveEaTypeExpr(ea);
    if (!typeExpr) return undefined;
    return resolveScalarKind(typeExpr);
  };

  for (const [aliasLower, aliasTarget] of moduleAliasTargets) {
    if (storageTypes.has(aliasLower)) continue;
    const inferred = resolveEaTypeExpr(aliasTarget);
    if (!inferred) {
      const decl = moduleAliasDecls.get(aliasLower);
      const target = decl?.name ?? aliasLower;
      if (decl) {
        diagAt(
          diagnostics,
          decl.span,
          `Incompatible inferred alias binding for "${target}": unable to infer type from alias source.`,
        );
      } else {
        diag(
          diagnostics,
          program.entryFile,
          `Incompatible inferred alias binding for "${target}": unable to infer type from alias source.`,
        );
      }
      continue;
    }
    storageTypes.set(aliasLower, inferred);
  }

  const countRuntimeAtomsInImmExpr = (expr: ImmExprNode): number => {
    switch (expr.kind) {
      case 'ImmLiteral':
      case 'ImmSizeof':
        return 0;
      case 'ImmOffsetof':
        return expr.path.steps.reduce(
          (acc, step) =>
            acc + (step.kind === 'OffsetofIndex' ? countRuntimeAtomsInImmExpr(step.expr) : 0),
          0,
        );
      case 'ImmName':
        return resolveScalarBinding(expr.name) ? 1 : 0;
      case 'ImmUnary':
        return countRuntimeAtomsInImmExpr(expr.expr);
      case 'ImmBinary':
        return countRuntimeAtomsInImmExpr(expr.left) + countRuntimeAtomsInImmExpr(expr.right);
    }
  };

  const countRuntimeAtomsInEaExpr = (ea: EaExprNode): number => {
    switch (ea.kind) {
      case 'EaName':
        return resolveScalarBinding(ea.name) || runtimeAtomRegisterNames.has(ea.name.toUpperCase())
          ? 1
          : 0;
      case 'EaField':
        return countRuntimeAtomsInEaExpr(ea.base);
      case 'EaAdd':
      case 'EaSub':
        return countRuntimeAtomsInEaExpr(ea.base) + countRuntimeAtomsInImmExpr(ea.offset);
      case 'EaIndex': {
        const baseAtoms = countRuntimeAtomsInEaExpr(ea.base);
        switch (ea.index.kind) {
          case 'IndexImm':
            return baseAtoms + countRuntimeAtomsInImmExpr(ea.index.value);
          case 'IndexReg8':
          case 'IndexReg16':
          case 'IndexMemHL':
            return baseAtoms + 1;
          case 'IndexMemIxIy':
            return baseAtoms + 1 + (ea.index.disp ? countRuntimeAtomsInImmExpr(ea.index.disp) : 0);
          case 'IndexEa':
            return baseAtoms + Math.max(1, countRuntimeAtomsInEaExpr(ea.index.expr));
        }
      }
    }
  };

  const enforceEaRuntimeAtomBudget = (operand: AsmOperandNode, context: string): boolean => {
    if (operand.kind !== 'Ea' && operand.kind !== 'Mem') return true;
    const atoms = countRuntimeAtomsInEaExpr(operand.expr);
    if (atoms <= 1) return true;
    diagAt(
      diagnostics,
      operand.span,
      `${context} exceeds runtime-atom budget (max 1; found ${atoms}).`,
    );
    return false;
  };

  const countRuntimeAtomsForDirectCallSiteEa = (ea: EaExprNode): number => {
    switch (ea.kind) {
      case 'EaName': {
        const lower = ea.name.toLowerCase();
        const isBoundStorageName =
          stackSlotOffsets.has(lower) || stackSlotTypes.has(lower) || storageTypes.has(lower);
        if (isBoundStorageName) return 0;
        return runtimeAtomRegisterNames.has(ea.name.toUpperCase()) ? 1 : 0;
      }
      case 'EaField':
        return countRuntimeAtomsForDirectCallSiteEa(ea.base);
      case 'EaAdd':
      case 'EaSub':
        return (
          countRuntimeAtomsForDirectCallSiteEa(ea.base) + countRuntimeAtomsInImmExpr(ea.offset)
        );
      case 'EaIndex': {
        const baseAtoms = countRuntimeAtomsForDirectCallSiteEa(ea.base);
        switch (ea.index.kind) {
          case 'IndexImm':
            return baseAtoms + countRuntimeAtomsInImmExpr(ea.index.value);
          case 'IndexReg8':
          case 'IndexReg16':
          case 'IndexMemHL':
            return baseAtoms + 1;
          case 'IndexMemIxIy':
            return baseAtoms + 1 + (ea.index.disp ? countRuntimeAtomsInImmExpr(ea.index.disp) : 0);
          case 'IndexEa':
            return baseAtoms + Math.max(1, countRuntimeAtomsForDirectCallSiteEa(ea.index.expr));
        }
      }
    }
  };

  const enforceDirectCallSiteEaBudget = (operand: AsmOperandNode, calleeName: string): boolean => {
    if (operand.kind !== 'Ea' && operand.kind !== 'Mem') return true;
    const atoms = countRuntimeAtomsForDirectCallSiteEa(operand.expr);
    if (atoms === 0) return true;
    const form = operand.kind === 'Mem' ? '(ea)' : 'ea';
    diagAt(
      diagnostics,
      operand.span,
      `Direct call-site ${form} argument for "${calleeName}" must be runtime-atom-free in v0.2 (found ${atoms}). Stage dynamic addressing in prior instructions and pass a register or precomputed slot value.`,
    );
    return false;
  };

  const resolveEa = (ea: EaExprNode, span: SourceSpan): EaResolution | undefined => {
    const go = (expr: EaExprNode, visitingAliases: Set<string>): EaResolution | undefined => {
      switch (expr.kind) {
        case 'EaName': {
          const baseLower = expr.name.toLowerCase();
          const slotOff = stackSlotOffsets.get(baseLower);
          if (slotOff !== undefined) {
            const slotType = stackSlotTypes.get(baseLower);
            return {
              kind: 'stack',
              ixDisp: slotOff,
              ...(slotType ? { typeExpr: slotType } : {}),
            };
          }
          const aliasTarget = resolveAliasTarget(baseLower);
          if (aliasTarget) {
            if (visitingAliases.has(baseLower)) return undefined;
            visitingAliases.add(baseLower);
            try {
              return go(aliasTarget, visitingAliases);
            } finally {
              visitingAliases.delete(baseLower);
            }
          }
          const typeExpr = storageTypes.get(baseLower);
          return { kind: 'abs', baseLower, addend: 0, ...(typeExpr ? { typeExpr } : {}) };
        }
        case 'EaAdd':
        case 'EaSub': {
          const base = go(expr.base, visitingAliases);
          if (!base) return undefined;
          const v = evalImmNoDiag(expr.offset);
          if (v === undefined) return undefined;
          const delta = expr.kind === 'EaAdd' ? v : -v;
          if (base.kind === 'abs') return { ...base, addend: base.addend + delta };
          return { ...base, ixDisp: base.ixDisp + delta };
        }
        case 'EaField': {
          const base = go(expr.base, visitingAliases);
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
                ixDisp: base.ixDisp + off,
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
          const base = go(expr.base, visitingAliases);
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
            return undefined;
          }
          if (expr.index.kind !== 'IndexImm') return undefined;
          const idx = evalImmExpr(expr.index.value, env, diagnostics);
          if (idx === undefined) {
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
            ixDisp: base.ixDisp + idx * elemSize,
            typeExpr: base.typeExpr.element,
          };
        }
      }
    };

    return go(ea, new Set<string>());
  };

  const pushEaAddress = (ea: EaExprNode, span: SourceSpan): boolean => {
    const r = resolveEa(ea, span);
    if (!r) {
      type RuntimeLinear = {
        constTerm: number;
        atomName?: string;
        atomKind?: 'byte' | 'word' | 'addr';
        coeff: number;
      };
      const mkRuntimeLinear = (
        constTerm: number,
        coeff: number,
        atom?: { name: string; kind: 'byte' | 'word' | 'addr' },
      ): RuntimeLinear =>
        atom
          ? { constTerm, coeff, atomName: atom.name, atomKind: atom.kind }
          : { constTerm, coeff };

      const isPowerOfTwo = (n: number): boolean => n > 0 && (n & (n - 1)) === 0;

      const combineRuntimeLinear = (
        left: RuntimeLinear | undefined,
        right: RuntimeLinear | undefined,
        op: '+' | '-',
      ): RuntimeLinear | undefined => {
        if (!left || !right) return undefined;
        const rightCoeff = op === '+' ? right.coeff : -right.coeff;
        const rightConst = op === '+' ? right.constTerm : -right.constTerm;
        if (!left.atomName && !right.atomName) {
          return mkRuntimeLinear(left.constTerm + rightConst, 0);
        }
        if (!left.atomName) {
          if (!right.atomName || !right.atomKind) return undefined;
          return mkRuntimeLinear(left.constTerm + rightConst, rightCoeff, {
            name: right.atomName,
            kind: right.atomKind,
          });
        }
        if (!right.atomName) {
          if (!left.atomKind) return undefined;
          return mkRuntimeLinear(left.constTerm + rightConst, left.coeff, {
            name: left.atomName,
            kind: left.atomKind,
          });
        }
        if (left.atomName !== right.atomName) return undefined;
        if (!left.atomKind) return undefined;
        return mkRuntimeLinear(left.constTerm + rightConst, left.coeff + rightCoeff, {
          name: left.atomName,
          kind: left.atomKind,
        });
      };

      const runtimeLinearFromImm = (expr: ImmExprNode): RuntimeLinear | undefined => {
        const imm = evalImmNoDiag(expr);
        if (imm !== undefined) return mkRuntimeLinear(imm, 0);

        switch (expr.kind) {
          case 'ImmLiteral':
          case 'ImmSizeof':
          case 'ImmOffsetof':
            return mkRuntimeLinear(evalImmExpr(expr, env, diagnostics) ?? 0, 0);
          case 'ImmName': {
            const scalar = resolveScalarBinding(expr.name);
            if (!scalar) return undefined;
            return mkRuntimeLinear(0, 1, { name: expr.name, kind: scalar });
          }
          case 'ImmUnary': {
            const inner = runtimeLinearFromImm(expr.expr);
            if (!inner) return undefined;
            if (expr.op === '+') return inner;
            if (expr.op === '-') {
              return inner.atomName && inner.atomKind
                ? mkRuntimeLinear(-inner.constTerm, -inner.coeff, {
                    name: inner.atomName,
                    kind: inner.atomKind,
                  })
                : mkRuntimeLinear(-inner.constTerm, -inner.coeff);
            }
            return undefined;
          }
          case 'ImmBinary': {
            const left = runtimeLinearFromImm(expr.left);
            const right = runtimeLinearFromImm(expr.right);
            if (!left || !right) return undefined;
            switch (expr.op) {
              case '+':
              case '-':
                return combineRuntimeLinear(left, right, expr.op);
              case '*': {
                const leftConstOnly = !left.atomName;
                const rightConstOnly = !right.atomName;
                if (leftConstOnly && rightConstOnly) {
                  return mkRuntimeLinear(left.constTerm * right.constTerm, 0);
                }
                if (leftConstOnly && right.atomName) {
                  if (!right.atomKind) return undefined;
                  return mkRuntimeLinear(
                    right.constTerm * left.constTerm,
                    right.coeff * left.constTerm,
                    {
                      name: right.atomName,
                      kind: right.atomKind,
                    },
                  );
                }
                if (rightConstOnly && left.atomName) {
                  if (!left.atomKind) return undefined;
                  return mkRuntimeLinear(
                    left.constTerm * right.constTerm,
                    left.coeff * right.constTerm,
                    {
                      name: left.atomName,
                      kind: left.atomKind,
                    },
                  );
                }
                return undefined;
              }
              case '<<': {
                if (right.atomName) return undefined;
                const shift = right.constTerm;
                if (!Number.isInteger(shift) || shift < 0 || shift > 15) return undefined;
                const factor = 1 << shift;
                return left.atomName && left.atomKind
                  ? mkRuntimeLinear(left.constTerm * factor, left.coeff * factor, {
                      name: left.atomName,
                      kind: left.atomKind,
                    })
                  : mkRuntimeLinear(left.constTerm * factor, left.coeff * factor);
              }
              default:
                return undefined;
            }
          }
        }
      };

      const materializeRuntimeImmToHL = (expr: ImmExprNode, context: string): boolean => {
        const imm = evalImmExpr(expr, env, diagnostics);
        if (imm !== undefined) return loadImm16ToHL(imm & 0xffff, span);

        const linear = runtimeLinearFromImm(expr);
        if (!linear) {
          diagAt(
            diagnostics,
            span,
            `${context} is unsupported. Use a single scalar runtime atom with +, -, *, << and constants (no /, %, &, |, ^, >> on runtime atoms).`,
          );
          return false;
        }

        if (!linear.atomName || !linear.atomKind || linear.coeff === 0) {
          return loadImm16ToHL(linear.constTerm & 0xffff, span);
        }

        const coeffSign = linear.coeff < 0 ? -1 : 1;
        const coeffAbs = Math.abs(linear.coeff);
        if (!isPowerOfTwo(coeffAbs)) {
          diagAt(
            diagnostics,
            span,
            `${context} runtime multiplier must be a power-of-2; found ${linear.coeff}.`,
          );
          return false;
        }

        const atomEa: EaExprNode = { kind: 'EaName', span, name: linear.atomName };
        const want = linear.atomKind === 'byte' ? 'byte' : 'word';
        if (!pushMemValue(atomEa, want, span)) return false;
        if (!emitInstr('pop', [{ kind: 'Reg', span, name: 'HL' }], span)) return false;

        const shiftCount = coeffAbs <= 1 ? 0 : Math.log2(coeffAbs);
        for (let i = 0; i < shiftCount; i++) {
          if (
            !emitInstr(
              'add',
              [
                { kind: 'Reg', span, name: 'HL' },
                { kind: 'Reg', span, name: 'HL' },
              ],
              span,
            )
          ) {
            return false;
          }
        }

        if (coeffSign < 0 && !negateHL(span)) return false;

        const addend = linear.constTerm & 0xffff;
        if (addend !== 0) {
          if (!loadImm16ToDE(addend, span)) return false;
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
        }
        return true;
      };

      // Fallback: support runtime indexing and runtime ea offsets by
      // computing dynamic portions into HL and then combining with base.
      if (ea.kind !== 'EaIndex' && ea.kind !== 'EaAdd' && ea.kind !== 'EaSub') return false;
      if (ea.kind === 'EaAdd' || ea.kind === 'EaSub') {
        if (!pushEaAddress(ea.base, span)) return false;
        if (!emitInstr('pop', [{ kind: 'Reg', span, name: 'HL' }], span)) return false;
        if (!emitInstr('push', [{ kind: 'Reg', span, name: 'HL' }], span)) return false;
        if (!materializeRuntimeImmToHL(ea.offset, 'Runtime EA offset expression')) return false;
        if (ea.kind === 'EaSub' && !negateHL(span)) return false;
        if (!emitInstr('pop', [{ kind: 'Reg', span, name: 'DE' }], span)) return false;
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

      const baseType = resolveEaTypeExpr(ea.base);
      if (!baseType || baseType.kind !== 'ArrayType') {
        diagAt(diagnostics, span, `Unsupported ea argument: cannot lower indexed address.`);
        return false;
      }
      const elemSize = sizeOfTypeExpr(baseType.element, env, diagnostics);
      if (elemSize === undefined) return false;
      if (elemSize <= 0 || (elemSize & (elemSize - 1)) !== 0) {
        diagAt(
          diagnostics,
          span,
          `Non-constant indexing requires power-of-2 element size (got ${elemSize}).`,
        );
        return false;
      }
      const shiftCount = elemSize <= 1 ? 0 : Math.log2(elemSize);

      // If the index is sourced from (HL), read it before clobbering HL.
      if (ea.index.kind === 'IndexMemHL') {
        emitRawCodeBytes(Uint8Array.of(0x7e), span.file, 'ld a, (hl)');
      }
      if (ea.index.kind === 'IndexMemIxIy') {
        const memExpr: EaExprNode =
          ea.index.disp === undefined
            ? { kind: 'EaName', span, name: ea.index.base }
            : {
                kind: 'EaAdd',
                span,
                base: { kind: 'EaName', span, name: ea.index.base },
                offset: ea.index.disp,
              };
        if (
          !emitInstr(
            'ld',
            [
              { kind: 'Reg', span, name: 'A' },
              { kind: 'Mem', span, expr: memExpr },
            ],
            span,
          )
        ) {
          return false;
        }
      }

      if (ea.index.kind === 'IndexImm') {
        if (!materializeRuntimeImmToHL(ea.index.value, 'Runtime array index expression')) {
          return false;
        }
      } else if (ea.index.kind === 'IndexEa') {
        const typeExpr = resolveEaTypeExpr(ea.index.expr);
        const scalar = typeExpr ? resolveScalarKind(typeExpr) : undefined;
        if (scalar === 'byte' || scalar === 'word' || scalar === 'addr') {
          const want = scalar === 'byte' ? 'byte' : 'word';
          if (!pushMemValue(ea.index.expr, want, span)) return false;
          if (!emitInstr('pop', [{ kind: 'Reg', span, name: 'HL' }], span)) return false;
        } else {
          diagAt(
            diagnostics,
            span,
            `Nested index expression must resolve to scalar byte/word/addr value.`,
          );
          return false;
        }
      } else if (ea.index.kind === 'IndexReg8') {
        const r8 = ea.index.reg.toUpperCase();
        if (!reg8.has(r8)) {
          diagAt(diagnostics, span, `Invalid reg8 index "${ea.index.reg}".`);
          return false;
        }
        if (
          !emitInstr(
            'ld',
            [
              { kind: 'Reg', span, name: 'L' },
              { kind: 'Reg', span, name: r8 },
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
              { kind: 'Reg', span, name: 'H' },
              { kind: 'Imm', span, expr: { kind: 'ImmLiteral', span, value: 0 } },
            ],
            span,
          )
        ) {
          return false;
        }
      } else if (ea.index.kind === 'IndexMemHL' || ea.index.kind === 'IndexMemIxIy') {
        if (
          !emitInstr(
            'ld',
            [
              { kind: 'Reg', span, name: 'L' },
              { kind: 'Reg', span, name: 'A' },
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
              { kind: 'Reg', span, name: 'H' },
              { kind: 'Imm', span, expr: { kind: 'ImmLiteral', span, value: 0 } },
            ],
            span,
          )
        ) {
          return false;
        }
      } else if (ea.index.kind === 'IndexReg16') {
        const r16 = ea.index.reg.toUpperCase();
        if (r16 === 'HL') {
          // HL already holds index.
        } else if (r16 === 'DE') {
          if (
            !emitInstr(
              'ld',
              [
                { kind: 'Reg', span, name: 'H' },
                { kind: 'Reg', span, name: 'D' },
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
                { kind: 'Reg', span, name: 'E' },
              ],
              span,
            )
          ) {
            return false;
          }
        } else if (r16 === 'BC') {
          if (
            !emitInstr(
              'ld',
              [
                { kind: 'Reg', span, name: 'H' },
                { kind: 'Reg', span, name: 'B' },
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
                { kind: 'Reg', span, name: 'C' },
              ],
              span,
            )
          ) {
            return false;
          }
        } else {
          diagAt(diagnostics, span, `Invalid reg16 index "${ea.index.reg}".`);
          return false;
        }
      } else {
        diagAt(diagnostics, span, `Non-constant array indices are not supported yet.`);
        return false;
      }

      for (let i = 0; i < shiftCount; i++) {
        if (
          !emitInstr(
            'add',
            [
              { kind: 'Reg', span, name: 'HL' },
              { kind: 'Reg', span, name: 'HL' },
            ],
            span,
          )
        ) {
          return false;
        }
      }

      if (!emitInstr('push', [{ kind: 'Reg', span, name: 'HL' }], span)) return false;

      const baseResolved = resolveEa(ea.base, span);
      if (baseResolved?.kind === 'abs') {
        emitAbs16Fixup(0x21, baseResolved.baseLower, baseResolved.addend, span); // ld hl, nn
      } else if (baseResolved?.kind === 'stack') {
        if (!emitInstr('push', [{ kind: 'Reg', span, name: 'DE' }], span)) return false;
        if (
          !emitInstr('push', [{ kind: 'Reg', span, name: 'IX' }], span) ||
          !emitInstr('pop', [{ kind: 'Reg', span, name: 'HL' }], span)
        )
          return false;
        if (baseResolved.ixDisp !== 0) {
          if (!loadImm16ToDE(baseResolved.ixDisp & 0xffff, span)) return false;
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
        }
        if (!emitInstr('pop', [{ kind: 'Reg', span, name: 'DE' }], span)) return false;
      } else {
        if (!pushEaAddress(ea.base, span)) return false;
        if (!emitInstr('pop', [{ kind: 'Reg', span, name: 'HL' }], span)) return false;
      }

      if (!emitInstr('pop', [{ kind: 'Reg', span, name: 'DE' }], span)) return false;
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
      if (!emitInstr('push', [{ kind: 'Reg', span, name: 'DE' }], span)) return false;
      if (
        !emitInstr('push', [{ kind: 'Reg', span, name: 'IX' }], span) ||
        !emitInstr('pop', [{ kind: 'Reg', span, name: 'HL' }], span)
      )
        return false;
      if (r.ixDisp !== 0) {
        if (!loadImm16ToDE(r.ixDisp & 0xffff, span)) return false;
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
      }
      if (!emitInstr('pop', [{ kind: 'Reg', span, name: 'DE' }], span)) return false;
      return emitInstr('push', [{ kind: 'Reg', span, name: 'HL' }], span);
    }
    return emitInstr('push', [{ kind: 'Reg', span, name: 'HL' }], span);
  };

  const pushMemValue = (ea: EaExprNode, want: 'byte' | 'word', span: SourceSpan): boolean => {
    const r = resolveEa(ea, span);
    if (r?.kind === 'abs') {
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
      emitRawCodeBytes(Uint8Array.of(0x7e), span.file, 'ld a, (hl)');
      if (!emitInstr('inc', [{ kind: 'Reg', span, name: 'HL' }], span)) return false;
      emitRawCodeBytes(Uint8Array.of(0x66, 0x6f), span.file, 'ld h, (hl) ; ld l, a');
      return emitInstr('push', [{ kind: 'Reg', span, name: 'HL' }], span);
    }
    emitRawCodeBytes(Uint8Array.of(0x7e), span.file, 'ld a, (hl)');
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
    if (
      !emitInstr('push', [{ kind: 'Reg', span, name: 'IX' }], span) ||
      !emitInstr('pop', [{ kind: 'Reg', span, name: 'HL' }], span)
    )
      return false;
    if (r.ixDisp === 0) return true;
    if (!emitInstr('push', [{ kind: 'Reg', span, name: 'DE' }], span)) return false;
    if (!loadImm16ToDE(r.ixDisp & 0xffff, span)) return false;
    const ok = emitInstr(
      'add',
      [
        { kind: 'Reg', span, name: 'HL' },
        { kind: 'Reg', span, name: 'DE' },
      ],
      span,
    );
    if (!emitInstr('pop', [{ kind: 'Reg', span, name: 'DE' }], span)) return false;
    return ok;
  };

  const lowerLdWithEa = (inst: AsmInstructionNode): boolean => {
    if (inst.head.toLowerCase() !== 'ld' || inst.operands.length !== 2) return false;
    const coerceValueOperand = (op: AsmOperandNode): AsmOperandNode => {
      if (op.kind === 'Imm' && op.expr.kind === 'ImmName') {
        const scalar = resolveScalarBinding(op.expr.name);
        if (scalar) {
          return {
            kind: 'Mem',
            span: op.span,
            expr: { kind: 'EaName', span: op.span, name: op.expr.name },
          };
        }
      }
      if (op.kind === 'Ea') {
        if (op.explicitAddressOf) return op;
        const scalar = resolveScalarTypeForEa(op.expr);
        if (scalar) return { kind: 'Mem', span: op.span, expr: op.expr };
      }
      return op;
    };
    const dst = coerceValueOperand(inst.operands[0]!);
    const src = coerceValueOperand(inst.operands[1]!);
    const isRegisterToken = (name: string): boolean => {
      const token = name.toUpperCase();
      return (
        token === 'A' ||
        token === 'B' ||
        token === 'C' ||
        token === 'D' ||
        token === 'E' ||
        token === 'H' ||
        token === 'L' ||
        token === 'AF' ||
        token === 'BC' ||
        token === 'DE' ||
        token === 'HL' ||
        token === 'SP' ||
        token === 'IX' ||
        token === 'IY' ||
        token === 'IXH' ||
        token === 'IXL' ||
        token === 'IYH' ||
        token === 'IYL'
      );
    };
    const isBoundEaName = (name: string): boolean => {
      const lower = name.toLowerCase();
      return stackSlotOffsets.has(lower) || storageTypes.has(lower) || env.consts.has(lower);
    };
    const hasRegisterLikeEaBase = (ea: EaExprNode): boolean => {
      switch (ea.kind) {
        case 'EaName':
          return isRegisterToken(ea.name) && !isBoundEaName(ea.name);
        case 'EaField':
          return hasRegisterLikeEaBase(ea.base);
        case 'EaIndex':
          return hasRegisterLikeEaBase(ea.base);
        case 'EaAdd':
        case 'EaSub':
          return hasRegisterLikeEaBase(ea.base);
      }
    };
    const isEaNameHL = (ea: EaExprNode): boolean =>
      ea.kind === 'EaName' && ea.name.toUpperCase() === 'HL';
    const isEaNameBCorDE = (ea: EaExprNode): boolean =>
      ea.kind === 'EaName' && (ea.name.toUpperCase() === 'BC' || ea.name.toUpperCase() === 'DE');
    const isIxIyBaseEa = (ea: EaExprNode): boolean =>
      ea.kind === 'EaName' && (ea.name.toUpperCase() === 'IX' || ea.name.toUpperCase() === 'IY');
    const isIxIyDispMem = (op: AsmOperandNode): boolean =>
      op.kind === 'Mem' &&
      (isIxIyBaseEa(op.expr) ||
        (op.expr.kind === 'EaIndex' &&
          isIxIyBaseEa(op.expr.base) &&
          op.expr.index.kind === 'IndexImm') ||
        ((op.expr.kind === 'EaAdd' || op.expr.kind === 'EaSub') && isIxIyBaseEa(op.expr.base)));
    const ixDispMem = (disp: number): AsmOperandNode => ({
      kind: 'Mem',
      span: inst.span,
      expr:
        disp === 0
          ? { kind: 'EaName', span: inst.span, name: 'IX' }
          : {
              kind: disp >= 0 ? 'EaAdd' : 'EaSub',
              span: inst.span,
              base: { kind: 'EaName', span: inst.span, name: 'IX' },
              offset: { kind: 'ImmLiteral', span: inst.span, value: Math.abs(disp) },
            },
    });

    // LD r8, (ea)
    if (dst.kind === 'Reg' && src.kind === 'Mem') {
      const srcResolved = resolveEa(src.expr, inst.span);
      if (hasRegisterLikeEaBase(src.expr)) return false;
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
        emitRawCodeBytes(
          Uint8Array.of(0x46 + (d << 3)),
          inst.span.file,
          `ld ${dst.name.toUpperCase()}, (hl)`,
        );
        return true;
      }

      const r16 = dst.name.toUpperCase();
      if (r16 === 'HL') {
        if (srcResolved?.kind === 'stack') {
          const lo = srcResolved.ixDisp;
          const hi = srcResolved.ixDisp + 1;
          if (!emitInstr('push', [{ kind: 'Reg', span: inst.span, name: 'DE' }], inst.span))
            return false;
          if (
            !emitInstr(
              'ex',
              [
                { kind: 'Reg', span: inst.span, name: 'DE' },
                { kind: 'Reg', span: inst.span, name: 'HL' },
              ],
              inst.span,
            )
          )
            return false;
          if (
            !emitInstr(
              'ld',
              [{ kind: 'Reg', span: inst.span, name: 'E' }, ixDispMem(lo)],
              inst.span,
            )
          )
            return false;
          if (
            !emitInstr(
              'ld',
              [{ kind: 'Reg', span: inst.span, name: 'D' }, ixDispMem(hi)],
              inst.span,
            )
          )
            return false;
          if (
            !emitInstr(
              'ex',
              [
                { kind: 'Reg', span: inst.span, name: 'DE' },
                { kind: 'Reg', span: inst.span, name: 'HL' },
              ],
              inst.span,
            )
          )
            return false;
          return emitInstr('pop', [{ kind: 'Reg', span: inst.span, name: 'DE' }], inst.span);
        }
        const r = resolveEa(src.expr, inst.span);
        if (r?.kind === 'abs') {
          emitAbs16Fixup(0x2a, r.baseLower, r.addend, inst.span); // ld hl, (nn)
          return true;
        }
        if (!materializeEaAddressToHL(src.expr, inst.span)) return false;
        if (!emitInstr('push', [{ kind: 'Reg', span: inst.span, name: 'AF' }], inst.span)) {
          return false;
        }
        if (
          !emitInstr(
            'ld',
            [
              { kind: 'Reg', span: inst.span, name: 'A' },
              {
                kind: 'Mem',
                span: inst.span,
                expr: { kind: 'EaName', span: inst.span, name: 'HL' },
              },
            ],
            inst.span,
          )
        ) {
          return false;
        }
        if (!emitInstr('inc', [{ kind: 'Reg', span: inst.span, name: 'HL' }], inst.span)) {
          return false;
        }
        if (
          !emitInstr(
            'ld',
            [
              { kind: 'Reg', span: inst.span, name: 'H' },
              {
                kind: 'Mem',
                span: inst.span,
                expr: { kind: 'EaName', span: inst.span, name: 'HL' },
              },
            ],
            inst.span,
          )
        ) {
          return false;
        }
        if (
          !emitInstr(
            'ld',
            [
              { kind: 'Reg', span: inst.span, name: 'L' },
              { kind: 'Reg', span: inst.span, name: 'A' },
            ],
            inst.span,
          )
        ) {
          return false;
        }
        if (!emitInstr('pop', [{ kind: 'Reg', span: inst.span, name: 'AF' }], inst.span)) {
          return false;
        }
        return true;
      }
      if (r16 === 'DE') {
        if (srcResolved?.kind === 'stack') {
          const lo = srcResolved.ixDisp;
          const hi = srcResolved.ixDisp + 1;
          if (
            !emitInstr(
              'ld',
              [{ kind: 'Reg', span: inst.span, name: 'E' }, ixDispMem(lo)],
              inst.span,
            )
          )
            return false;
          return emitInstr(
            'ld',
            [{ kind: 'Reg', span: inst.span, name: 'D' }, ixDispMem(hi)],
            inst.span,
          );
        }
        const r = resolveEa(src.expr, inst.span);
        if (r?.kind === 'abs') {
          emitAbs16FixupEd(0x5b, r.baseLower, r.addend, inst.span); // ld de, (nn)
          return true;
        }
        if (!materializeEaAddressToHL(src.expr, inst.span)) return false;
        emitRawCodeBytes(
          Uint8Array.of(0x7e, 0x23, 0x56, 0x5f),
          inst.span.file,
          'ld a, (hl) ; inc hl ; ld d, (hl) ; ld e, a',
        );
        return true;
      }
      if (r16 === 'BC') {
        if (srcResolved?.kind === 'stack') {
          const lo = srcResolved.ixDisp;
          const hi = srcResolved.ixDisp + 1;
          if (!emitInstr('push', [{ kind: 'Reg', span: inst.span, name: 'DE' }], inst.span))
            return false;
          if (
            !emitInstr(
              'ld',
              [{ kind: 'Reg', span: inst.span, name: 'C' }, ixDispMem(lo)],
              inst.span,
            )
          )
            return false;
          if (
            !emitInstr(
              'ld',
              [{ kind: 'Reg', span: inst.span, name: 'B' }, ixDispMem(hi)],
              inst.span,
            )
          )
            return false;
          return emitInstr('pop', [{ kind: 'Reg', span: inst.span, name: 'DE' }], inst.span);
        }
        const r = resolveEa(src.expr, inst.span);
        if (r?.kind === 'abs') {
          emitAbs16FixupEd(0x4b, r.baseLower, r.addend, inst.span); // ld bc, (nn)
          return true;
        }
        if (!materializeEaAddressToHL(src.expr, inst.span)) return false;
        emitRawCodeBytes(
          Uint8Array.of(0x7e, 0x23, 0x46, 0x4f),
          inst.span.file,
          'ld a, (hl) ; inc hl ; ld b, (hl) ; ld c, a',
        );
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
        emitRawCodeBytes(
          Uint8Array.of(0x7e, 0x23, 0x66, 0x6f),
          inst.span.file,
          'ld a, (hl) ; inc hl ; ld h, (hl) ; ld l, a',
        );
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
      const dstResolved = resolveEa(dst.expr, inst.span);
      if (hasRegisterLikeEaBase(dst.expr)) return false;
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
        const preserveA = src.name.toUpperCase() === 'A';
        if (
          preserveA &&
          !emitInstr('push', [{ kind: 'Reg', span: inst.span, name: 'AF' }], inst.span)
        ) {
          return false;
        }
        if (!materializeEaAddressToHL(dst.expr, inst.span)) {
          if (
            preserveA &&
            !emitInstr('pop', [{ kind: 'Reg', span: inst.span, name: 'AF' }], inst.span)
          ) {
            return false;
          }
          return false;
        }
        if (
          preserveA &&
          !emitInstr('pop', [{ kind: 'Reg', span: inst.span, name: 'AF' }], inst.span)
        ) {
          return false;
        }
        emitRawCodeBytes(
          Uint8Array.of(0x70 + s8),
          inst.span.file,
          `ld (hl), ${src.name.toUpperCase()}`,
        );
        return true;
      }

      const r16 = src.name.toUpperCase();
      if (r16 === 'HL') {
        if (dstResolved?.kind === 'stack') {
          const lo = dstResolved.ixDisp;
          const hi = dstResolved.ixDisp + 1;
          if (!emitInstr('push', [{ kind: 'Reg', span: inst.span, name: 'DE' }], inst.span))
            return false;
          if (
            !emitInstr(
              'ex',
              [
                { kind: 'Reg', span: inst.span, name: 'DE' },
                { kind: 'Reg', span: inst.span, name: 'HL' },
              ],
              inst.span,
            )
          )
            return false;
          if (
            !emitInstr(
              'ld',
              [ixDispMem(lo), { kind: 'Reg', span: inst.span, name: 'E' }],
              inst.span,
            )
          )
            return false;
          if (
            !emitInstr(
              'ld',
              [ixDispMem(hi), { kind: 'Reg', span: inst.span, name: 'D' }],
              inst.span,
            )
          )
            return false;
          if (
            !emitInstr(
              'ex',
              [
                { kind: 'Reg', span: inst.span, name: 'DE' },
                { kind: 'Reg', span: inst.span, name: 'HL' },
              ],
              inst.span,
            )
          )
            return false;
          return emitInstr('pop', [{ kind: 'Reg', span: inst.span, name: 'DE' }], inst.span);
        }
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
        emitRawCodeBytes(
          Uint8Array.of(0x73, 0x23, 0x72),
          inst.span.file,
          'ld (hl), e ; inc hl ; ld (hl), d',
        );
        return true;
      }
      if (r16 === 'DE') {
        if (dstResolved?.kind === 'stack') {
          const lo = dstResolved.ixDisp;
          const hi = dstResolved.ixDisp + 1;
          if (
            !emitInstr(
              'ld',
              [ixDispMem(lo), { kind: 'Reg', span: inst.span, name: 'E' }],
              inst.span,
            )
          )
            return false;
          return emitInstr(
            'ld',
            [ixDispMem(hi), { kind: 'Reg', span: inst.span, name: 'D' }],
            inst.span,
          );
        }
        const r = resolveEa(dst.expr, inst.span);
        if (r?.kind === 'abs') {
          emitAbs16FixupEd(0x53, r.baseLower, r.addend, inst.span); // ld (nn), de
          return true;
        }
        if (!materializeEaAddressToHL(dst.expr, inst.span)) return false;
        emitRawCodeBytes(
          Uint8Array.of(0x73, 0x23, 0x72),
          inst.span.file,
          'ld (hl), e ; inc hl ; ld (hl), d',
        );
        return true;
      }
      if (r16 === 'BC') {
        if (dstResolved?.kind === 'stack') {
          const lo = dstResolved.ixDisp;
          const hi = dstResolved.ixDisp + 1;
          if (
            !emitInstr(
              'ld',
              [ixDispMem(lo), { kind: 'Reg', span: inst.span, name: 'C' }],
              inst.span,
            )
          )
            return false;
          return emitInstr(
            'ld',
            [ixDispMem(hi), { kind: 'Reg', span: inst.span, name: 'B' }],
            inst.span,
          );
        }
        const r = resolveEa(dst.expr, inst.span);
        if (r?.kind === 'abs') {
          emitAbs16FixupEd(0x43, r.baseLower, r.addend, inst.span); // ld (nn), bc
          return true;
        }
        if (!materializeEaAddressToHL(dst.expr, inst.span)) return false;
        emitRawCodeBytes(
          Uint8Array.of(0x71, 0x23, 0x70),
          inst.span.file,
          'ld (hl), c ; inc hl ; ld (hl), b',
        );
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
        emitRawCodeBytes(
          Uint8Array.of(0x73, 0x23, 0x72),
          inst.span.file,
          'ld (hl), e ; inc hl ; ld (hl), d',
        );
        return true;
      }
    }

    // LD (ea), (ea) via A/HL
    if (dst.kind === 'Mem' && src.kind === 'Mem') {
      const scalar =
        resolveScalarTypeForEa(dst.expr) ?? resolveScalarTypeForEa(src.expr) ?? undefined;
      if (!scalar) return false;
      if (scalar === 'byte') {
        if (!materializeEaAddressToHL(src.expr, inst.span)) return false;
        emitRawCodeBytes(Uint8Array.of(0x7e), inst.span.file, 'ld a, (hl)');
        if (!materializeEaAddressToHL(dst.expr, inst.span)) return false;
        emitRawCodeBytes(Uint8Array.of(0x77), inst.span.file, 'ld (hl), a');
        return true;
      }
      if (!materializeEaAddressToHL(src.expr, inst.span)) return false;
      emitRawCodeBytes(
        Uint8Array.of(0x7e, 0x23, 0x66, 0x6f),
        inst.span.file,
        'ld a, (hl) ; inc hl ; ld h, (hl) ; ld l, a',
      );
      if (!emitInstr('push', [{ kind: 'Reg', span: inst.span, name: 'HL' }], inst.span))
        return false;
      if (!materializeEaAddressToHL(dst.expr, inst.span)) return false;
      if (!emitInstr('pop', [{ kind: 'Reg', span: inst.span, name: 'DE' }], inst.span))
        return false;
      emitRawCodeBytes(
        Uint8Array.of(0x73, 0x23, 0x72),
        inst.span.file,
        'ld (hl), e ; inc hl ; ld (hl), d',
      );
      return true;
    }

    // LD (ea), imm (imm8 for byte, imm16 for word/addr)
    if (dst.kind === 'Mem' && src.kind === 'Imm') {
      if (hasRegisterLikeEaBase(dst.expr)) return false;
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
      const fitsImm8 = (value: number): boolean => value >= -0x80 && value <= 0xff;
      const fitsImm16 = (value: number): boolean => value >= -0x8000 && value <= 0xffff;

      if (scalar === 'byte') {
        if (!fitsImm8(v)) {
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
        if (!fitsImm16(v)) {
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
          const lower = decl.name.toLowerCase();
          if (decl.typeExpr) {
            storageTypes.set(lower, decl.typeExpr);
            continue;
          }
          if (decl.initializer?.kind === 'VarInitAlias') {
            moduleAliasTargets.set(lower, decl.initializer.expr);
            moduleAliasDecls.set(lower, decl);
          }
        }
      } else if (item.kind === 'BinDecl') {
        const bd = item as BinDeclNode;
        declaredBinNames.add(bd.name.toLowerCase());
        rawAddressSymbols.add(bd.name.toLowerCase());
        storageTypes.set(bd.name.toLowerCase(), { kind: 'TypeName', span: bd.span, name: 'addr' });
      } else if (item.kind === 'HexDecl') {
        const hd = item as HexDeclNode;
        rawAddressSymbols.add(hd.name.toLowerCase());
        storageTypes.set(hd.name.toLowerCase(), { kind: 'TypeName', span: hd.span, name: 'addr' });
      } else if (item.kind === 'DataBlock') {
        const db = item as DataBlockNode;
        for (const decl of db.decls) {
          rawAddressSymbols.add(decl.name.toLowerCase());
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
            address: v & 0xffff,
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
          const member = e.members[idx]!;
          const name = `${e.name}.${member}`;
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
            address: idx & 0xffff,
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
            `bin declarations cannot target section "var" in v0.2.`,
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
        localAliasTargets = new Map<string, EaExprNode>();
        spDeltaTracked = 0;
        spTrackingValid = true;
        spTrackingInvalidatedByMutation = false;

        const localDecls = item.locals?.decls ?? [];
        const preserveSet = (() => {
          const kind = resolveScalarKind(item.returnType);
          const isFlags = (item as { returnFlags?: boolean }).returnFlags === true;
          let base: string[] = [];
          switch (kind) {
            case 'byte':
            case 'word':
            case 'addr':
            case undefined: // default to conservative for unknown
              base = ['AF', 'BC', 'DE'];
              break;
            case 'long':
              base = ['AF', 'BC'];
              break;
            case 'verylong':
              base = ['AF'];
              break;
            case 'void':
              base = ['AF', 'BC', 'DE'];
              break;
          }
          if (isFlags) {
            base = base.filter((r) => r !== 'AF');
          }
          // HL is always volatile; ensure not preserved.
          return base.filter((r) => r !== 'HL');
        })();
        const shouldPreserveTypedBoundary = preserveSet.length > 0;
        let localSlotCount = 0;
        const localScalarInitializers: Array<{
          name: string;
          expr?: ImmExprNode;
          span: SourceSpan;
          scalarKind: 'byte' | 'word' | 'addr';
        }> = [];
        const preserveBytes = preserveSet.length * 2;
        for (let li = 0; li < localDecls.length; li++) {
          const decl = localDecls[li]!;
          const declLower = decl.name.toLowerCase();
          if (decl.typeExpr) {
            const scalarKind = resolveScalarKind(decl.typeExpr);
            if (!scalarKind) {
              diagAt(
                diagnostics,
                decl.span,
                `Non-scalar local storage declaration "${decl.name}" requires alias form ("${decl.name} = rhs").`,
              );
              continue;
            }
            const localIxDisp = -(preserveBytes + 2 * (localSlotCount + 1));
            stackSlotOffsets.set(declLower, localIxDisp);
            stackSlotTypes.set(declLower, decl.typeExpr);
            localSlotCount++;
            const init = decl.initializer;
            if (init && init.kind !== 'VarInitValue') {
              diagAt(
                diagnostics,
                decl.span,
                `Unsupported typed alias form for "${decl.name}": use "${decl.name} = rhs" for alias initialization.`,
              );
              continue;
            }
            localScalarInitializers.push({
              name: decl.name,
              ...(init ? { expr: init.expr } : {}),
              span: decl.span,
              scalarKind,
            });
            continue;
          }
          const init = decl.initializer;
          if (init?.kind !== 'VarInitAlias') {
            diagAt(
              diagnostics,
              decl.span,
              `Invalid local declaration "${decl.name}": expected typed storage or alias initializer.`,
            );
            continue;
          }
          localAliasTargets.set(declLower, init.expr);
          const inferred = resolveEaTypeExpr(init.expr);
          if (!inferred) {
            diagAt(
              diagnostics,
              decl.span,
              `Incompatible inferred alias binding for "${decl.name}": unable to infer type from alias source.`,
            );
            continue;
          }
          stackSlotTypes.set(declLower, inferred);
        }
        const frameSize = localSlotCount * 2;
        const argc = item.params.length;
        const hasStackSlots = frameSize > 0 || argc > 0;
        for (let paramIndex = 0; paramIndex < argc; paramIndex++) {
          const p = item.params[paramIndex]!;
          const base = 4 + 2 * paramIndex;
          stackSlotOffsets.set(p.name.toLowerCase(), base);
          stackSlotTypes.set(p.name.toLowerCase(), p.typeExpr);
        }

        let epilogueLabel = `__zax_epilogue_${generatedLabelCounter++}`;
        while (taken.has(epilogueLabel)) {
          epilogueLabel = `__zax_epilogue_${generatedLabelCounter++}`;
        }
        // Synthetic per-function cleanup label used for rewritten returns.
        const emitSyntheticEpilogue =
          shouldPreserveTypedBoundary || hasStackSlots || localScalarInitializers.length > 0;

        // Function entry label.
        traceComment(codeOffset, `func ${item.name} begin`);
        if (taken.has(item.name)) {
          diag(diagnostics, item.span.file, `Duplicate symbol name "${item.name}".`);
        } else {
          taken.add(item.name);
          traceLabel(codeOffset, item.name);
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

        if (hasStackSlots) {
          const prevTag = currentCodeSegmentTag;
          currentCodeSegmentTag = {
            file: item.span.file,
            line: item.span.start.line,
            column: item.span.start.column,
            kind: 'code',
            confidence: 'high',
          };
          try {
            if (
              emitInstr('push', [{ kind: 'Reg', span: item.span, name: 'IX' }], item.span) &&
              emitInstr(
                'ld',
                [
                  { kind: 'Reg', span: item.span, name: 'IX' },
                  {
                    kind: 'Imm',
                    span: item.span,
                    expr: { kind: 'ImmLiteral', span: item.span, value: 0 },
                  },
                ],
                item.span,
              )
            ) {
              emitInstr(
                'add',
                [
                  { kind: 'Reg', span: item.span, name: 'IX' },
                  { kind: 'Reg', span: item.span, name: 'SP' },
                ],
                item.span,
              );
            }
          } finally {
            currentCodeSegmentTag = prevTag;
          }
        }

        if (shouldPreserveTypedBoundary) {
          const prevTag = currentCodeSegmentTag;
          currentCodeSegmentTag = {
            file: item.span.file,
            line: item.span.start.line,
            column: item.span.start.column,
            kind: 'code',
            confidence: 'high',
          };
          try {
            for (const reg of preserveSet) {
              emitInstr('push', [{ kind: 'Reg', span: item.span, name: reg }], item.span);
            }
          } finally {
            currentCodeSegmentTag = prevTag;
          }
        }

        for (const init of localScalarInitializers) {
          const prevTag = currentCodeSegmentTag;
          currentCodeSegmentTag = {
            file: init.span.file,
            line: init.span.start.line,
            column: init.span.start.column,
            kind: 'code',
            confidence: 'high',
          };
          try {
            if (!init.expr) {
              if (!loadImm16ToHL(0, init.span)) continue;
              emitInstr('push', [{ kind: 'Reg', span: init.span, name: 'HL' }], init.span);
              continue;
            }
            const initValue = evalImmExpr(init.expr, env, diagnostics);
            if (initValue === undefined) {
              diagAt(
                diagnostics,
                init.span,
                `Failed to evaluate local initializer for "${init.name}".`,
              );
              continue;
            }
            const narrowed = init.scalarKind === 'byte' ? initValue & 0xff : initValue & 0xffff;
            if (!loadImm16ToHL(narrowed, init.span)) continue;
            emitInstr('push', [{ kind: 'Reg', span: init.span, name: 'HL' }], init.span);
          } finally {
            currentCodeSegmentTag = prevTag;
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
        type OpExpansionFrame = {
          key: string;
          name: string;
          declSpan: SourceSpan;
          callSiteSpan: SourceSpan;
        };
        const opExpansionStack: OpExpansionFrame[] = [];
        const currentOpExpansionFrame = (): OpExpansionFrame | undefined =>
          opExpansionStack.length > 0 ? opExpansionStack[opExpansionStack.length - 1] : undefined;
        const rootOpExpansionFrame = (): OpExpansionFrame | undefined =>
          opExpansionStack.length > 0 ? opExpansionStack[0] : undefined;
        const currentMacroCallSiteSpan = (): SourceSpan | undefined =>
          rootOpExpansionFrame()?.callSiteSpan;
        const formatInstructionForOpExpansionDiag = (inst: AsmInstructionNode): string => {
          const ops = inst.operands.map(formatAsmOperandForOpDiag).join(', ');
          return ops.length > 0 ? `${inst.head} ${ops}` : inst.head;
        };
        const appendInvalidOpExpansionDiagnostic = (
          inst: AsmInstructionNode,
          diagnosticsStart: number,
        ): void => {
          const frame = currentOpExpansionFrame();
          if (!frame) return;
          const rootFrame = rootOpExpansionFrame();
          const newDiagnostics = diagnostics.slice(diagnosticsStart);
          const hasConcreteInstructionFailure = newDiagnostics.some(
            (d) =>
              d.severity === 'error' &&
              (d.id === DiagnosticIds.EncodeError || d.id === DiagnosticIds.EmitError),
          );
          if (!hasConcreteInstructionFailure) return;
          if (
            newDiagnostics.some(
              (d) =>
                d.id === DiagnosticIds.OpInvalidExpansion ||
                d.id === DiagnosticIds.OpArityMismatch ||
                d.id === DiagnosticIds.OpNoMatchingOverload ||
                d.id === DiagnosticIds.OpAmbiguousOverload ||
                d.id === DiagnosticIds.OpExpansionCycle,
            )
          ) {
            return;
          }
          const expansionChain = opExpansionStack
            .map((entry) => `${entry.name} (${entry.declSpan.file}:${entry.declSpan.start.line})`)
            .join(' -> ');
          diagAtWithId(
            diagnostics,
            rootFrame?.callSiteSpan ?? frame.callSiteSpan,
            DiagnosticIds.OpInvalidExpansion,
            `Invalid op expansion in "${frame.name}" at call site.\n` +
              `expanded instruction: ${formatInstructionForOpExpansionDiag(inst)}\n` +
              `op definition: ${frame.declSpan.file}:${frame.declSpan.start.line}\n` +
              `expansion chain: ${expansionChain}`,
          );
        };
        const sourceTagForSpan = (span: SourceSpan): SourceSegmentTag => {
          const macroCallSite = currentMacroCallSiteSpan();
          const taggedSpan = macroCallSite ?? span;
          return {
            file: taggedSpan.file,
            line: taggedSpan.start.line,
            column: taggedSpan.start.column,
            kind: macroCallSite ? 'macro' : 'code',
            confidence: 'high',
          };
        };
        const withCodeSourceTag = <T>(tag: SourceSegmentTag, fn: () => T): T => {
          const prev = currentCodeSegmentTag;
          currentCodeSegmentTag = tag;
          try {
            return fn();
          } finally {
            currentCodeSegmentTag = prev;
          }
        };

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
          traceLabel(codeOffset, name);
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
          emitAbs16Fixup(0xc3, label.toLowerCase(), 0, span, `jp ${label}`);
        };
        const emitJumpCondTo = (op: number, label: string, span: SourceSpan): void => {
          const ccName = conditionNameFromOpcode(op) ?? 'cc';
          emitAbs16Fixup(op, label.toLowerCase(), 0, span, `jp ${ccName.toLowerCase()}, ${label}`);
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
          let mismatch = false;
          if (
            (!left.spValid || !right.spValid) &&
            (left.spInvalidDueToMutation || right.spInvalidDueToMutation)
          ) {
            diagAt(
              diagnostics,
              span,
              `Cannot verify stack depth at ${contextName} join due to untracked SP mutation.`,
            );
          } else if ((!left.spValid || !right.spValid) && hasStackSlots) {
            diagAt(
              diagnostics,
              span,
              `Cannot verify stack depth at ${contextName} join due to unknown stack state.`,
            );
          }
          if (left.spValid && right.spValid && left.spDelta !== right.spDelta) {
            mismatch = true;
            diagAt(
              diagnostics,
              span,
              `Stack depth mismatch at ${contextName} join (${left.spDelta} vs ${right.spDelta}).`,
            );
          }
          return {
            reachable: true,
            spDelta: left.spDelta,
            spValid: left.spValid && right.spValid && !mismatch,
            spInvalidDueToMutation: left.spInvalidDueToMutation || right.spInvalidDueToMutation,
          };
        };
        const emitSelectCompareToImm16 = (
          value: number,
          mismatchLabel: string,
          span: SourceSpan,
        ): void => {
          emitRawCodeBytes(Uint8Array.of(0x7d), span.file, 'ld a, l');
          emitRawCodeBytes(Uint8Array.of(0xfe, value & 0xff), span.file, 'cp imm8');
          emitJumpCondTo(0xc2, mismatchLabel, span); // jp nz, mismatch
          emitRawCodeBytes(Uint8Array.of(0x7c), span.file, 'ld a, h');
          emitRawCodeBytes(Uint8Array.of(0xfe, (value >> 8) & 0xff), span.file, 'cp imm8');
          emitJumpCondTo(0xc2, mismatchLabel, span); // jp nz, mismatch
        };
        const emitSelectCompareReg8ToImm8 = (
          value: number,
          mismatchLabel: string,
          span: SourceSpan,
        ): void => {
          emitRawCodeBytes(Uint8Array.of(0xfe, value & 0xff), span.file, 'cp imm8');
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
          const prevTag = currentCodeSegmentTag;
          const diagnosticsStart = diagnostics.length;
          currentCodeSegmentTag = sourceTagForSpan(asmItem.span);
          try {
            for (const operand of asmItem.operands) {
              if (!enforceEaRuntimeAtomBudget(operand, 'Source ea expression')) return;
            }

            const diagIfRetStackImbalanced = (mnemonic = 'ret'): void => {
              if (spTrackingValid && spDeltaTracked !== 0) {
                diagAt(
                  diagnostics,
                  asmItem.span,
                  `${mnemonic} with non-zero tracked stack delta (${spDeltaTracked}); function stack is imbalanced.`,
                );
                return;
              }
              if (!spTrackingValid && spTrackingInvalidatedByMutation && hasStackSlots) {
                diagAt(
                  diagnostics,
                  asmItem.span,
                  `${mnemonic} reached after untracked SP mutation; cannot verify function stack balance.`,
                );
                return;
              }
              if (!spTrackingValid && hasStackSlots) {
                diagAt(
                  diagnostics,
                  asmItem.span,
                  `${mnemonic} reached with unknown stack depth; cannot verify function stack balance.`,
                );
              }
            };
            const diagIfCallStackUnverifiable = (options?: {
              mnemonic?: string;
              contractKind?: 'callee' | 'typed-call';
            }): void => {
              const mnemonic = options?.mnemonic ?? 'call';
              const contractKind = options?.contractKind ?? 'callee';
              const contractNoun =
                contractKind === 'typed-call'
                  ? 'typed-call boundary contract'
                  : 'callee stack contract';
              if (hasStackSlots && spTrackingValid && spDeltaTracked > 0) {
                diagAt(
                  diagnostics,
                  asmItem.span,
                  `${mnemonic} reached with positive tracked stack delta (${spDeltaTracked}); cannot verify ${contractNoun}.`,
                );
                return;
              }
              if (hasStackSlots && !spTrackingValid && spTrackingInvalidatedByMutation) {
                diagAt(
                  diagnostics,
                  asmItem.span,
                  `${mnemonic} reached after untracked SP mutation; cannot verify ${contractNoun}.`,
                );
                return;
              }
              if (hasStackSlots && !spTrackingValid) {
                diagAt(
                  diagnostics,
                  asmItem.span,
                  `${mnemonic} reached with unknown stack depth; cannot verify ${contractNoun}.`,
                );
              }
            };
            const warnIfRawCallTargetsTypedCallable = (
              symbolicTarget: { baseLower: string; addend: number } | undefined,
            ): void => {
              if (!rawTypedCallWarningsEnabled || !symbolicTarget || symbolicTarget.addend !== 0) {
                return;
              }
              const callable = callables.get(symbolicTarget.baseLower);
              if (!callable) return;
              const typedName = callable.node.name;
              diagAtWithSeverityAndId(
                diagnostics,
                asmItem.span,
                DiagnosticIds.RawCallTypedTargetWarning,
                'warning',
                `Raw call targets typed callable "${typedName}" and bypasses typed-call argument/preservation semantics; use typed call syntax unless raw ABI is intentional.`,
              );
            };
            const callable = callables.get(asmItem.head.toLowerCase());
            if (callable) {
              const args = asmItem.operands;
              const params = callable.kind === 'func' ? callable.node.params : callable.node.params;
              const calleeName = callable.node.name;
              const returnType =
                callable.kind === 'func' ? callable.node.returnType : callable.node.returnType;
              // Internal typed calls: callee-save in prologue/epilogue.
              // Extern typed calls: no automatic preservation; caller may choose to save explicitly.
              const preservedRegs: string[] = [];
              if (args.length !== params.length) {
                diagAt(
                  diagnostics,
                  asmItem.span,
                  `Call to "${asmItem.head}" has ${args.length} argument(s) but expects ${params.length}.`,
                );
                return;
              }
              const requiresDirectCallSiteEaBudget = (arg: AsmOperandNode): boolean => {
                if (arg.kind === 'Mem') return true;
                if (arg.kind !== 'Ea') return false;
                // Scalar-typed ea values in typed call-arg position are value-semantic and
                // are lowered like loads, so they follow the general source ea atom budget.
                // Address-style call-site ea arguments stay runtime-atom-free in v0.2.
                return resolveScalarTypeForEa(arg.expr) === undefined;
              };
              for (const arg of args) {
                if (!requiresDirectCallSiteEaBudget(arg)) continue;
                if (!enforceDirectCallSiteEaBudget(arg, calleeName)) return;
              }

              const typeForName = (name: string): TypeExprNode | undefined => {
                const lower = name.toLowerCase();
                return stackSlotTypes.get(lower) ?? storageTypes.get(lower);
              };
              const typeForArg = (arg: AsmOperandNode): TypeExprNode | undefined => {
                if (arg.kind === 'Ea') return resolveEaTypeExpr(arg.expr);
                if (arg.kind === 'Imm' && arg.expr.kind === 'ImmName')
                  return typeForName(arg.expr.name);
                return undefined;
              };
              const pushArgAddressFromName = (name: string): boolean =>
                pushEaAddress({ kind: 'EaName', span: asmItem.span, name } as any, asmItem.span);
              const pushArgAddressFromOperand = (arg: AsmOperandNode): boolean => {
                if (arg.kind === 'Ea') return pushEaAddress(arg.expr, asmItem.span);
                if (arg.kind === 'Imm' && arg.expr.kind === 'ImmName') {
                  return pushArgAddressFromName(arg.expr.name);
                }
                return false;
              };
              const checkNonScalarParamCompatibility = (
                param: ParamNode,
                argType: TypeExprNode,
              ): string | undefined => {
                const paramArray = resolveArrayType(param.typeExpr);
                const argArray = resolveArrayType(argType);
                if (paramArray) {
                  if (!argArray) {
                    return `Incompatible non-scalar argument for parameter "${param.name}": expected ${typeDisplay(
                      param.typeExpr,
                    )}, got ${typeDisplay(argType)}.`;
                  }
                  if (!sameTypeShape(paramArray.element, argArray.element)) {
                    return `Incompatible non-scalar argument for parameter "${param.name}": expected element type ${typeDisplay(
                      paramArray.element,
                    )}, got ${typeDisplay(argArray.element)}.`;
                  }
                  if (paramArray.length !== undefined) {
                    if (argArray.length === undefined) {
                      return `Incompatible non-scalar argument for parameter "${param.name}": expected ${typeDisplay(
                        param.typeExpr,
                      )}, got ${typeDisplay(argType)} (exact length proof required).`;
                    }
                    if (argArray.length !== paramArray.length) {
                      return `Incompatible non-scalar argument for parameter "${param.name}": expected ${typeDisplay(
                        param.typeExpr,
                      )}, got ${typeDisplay(argType)}.`;
                    }
                  }
                  return undefined;
                }

                if (!sameTypeShape(param.typeExpr, argType)) {
                  return `Incompatible non-scalar argument for parameter "${param.name}": expected ${typeDisplay(
                    param.typeExpr,
                  )}, got ${typeDisplay(argType)}.`;
                }
                return undefined;
              };

              const pushArgValueFromName = (name: string, want: 'byte' | 'word'): boolean => {
                const scalar = resolveScalarBinding(name);
                if (scalar) {
                  return pushMemValue(
                    { kind: 'EaName', span: asmItem.span, name } as any,
                    want,
                    asmItem.span,
                  );
                }
                return pushEaAddress(
                  { kind: 'EaName', span: asmItem.span, name } as any,
                  asmItem.span,
                );
              };
              const pushArgValueFromEa = (ea: EaExprNode, want: 'byte' | 'word'): boolean => {
                const scalar = resolveScalarTypeForEa(ea);
                if (scalar) return pushMemValue(ea, want, asmItem.span);
                return pushEaAddress(ea, asmItem.span);
              };
              const enumValueFromEa = (ea: EaExprNode): number | undefined => {
                const name = flattenEaDottedName(ea);
                if (!name) return undefined;
                return env.enums.get(name);
              };
              const restorePreservedRegs = (): boolean => {
                for (let ri = preservedRegs.length - 1; ri >= 0; ri--) {
                  if (
                    !emitInstr(
                      'pop',
                      [{ kind: 'Reg', span: asmItem.span, name: preservedRegs[ri]! }],
                      asmItem.span,
                    )
                  ) {
                    return false;
                  }
                }
                return true;
              };

              for (const reg of preservedRegs) {
                if (
                  !emitInstr('push', [{ kind: 'Reg', span: asmItem.span, name: reg }], asmItem.span)
                ) {
                  return;
                }
              }
              let ok = true;
              let pushedArgWords = 0;
              for (let ai = args.length - 1; ai >= 0; ai--) {
                const arg = args[ai]!;
                const param = params[ai]!;
                const scalarKind = resolveScalarKind(param.typeExpr);
                if (!scalarKind) {
                  const argType = typeForArg(arg);
                  if (!argType) {
                    diagAt(
                      diagnostics,
                      asmItem.span,
                      `Incompatible non-scalar argument for parameter "${param.name}": expected address-style operand bound to non-scalar storage.`,
                    );
                    ok = false;
                    break;
                  }
                  const compat = checkNonScalarParamCompatibility(param, argType);
                  if (compat) {
                    diagAt(diagnostics, asmItem.span, compat);
                    ok = false;
                    break;
                  }
                  if (!pushArgAddressFromOperand(arg)) {
                    diagAt(
                      diagnostics,
                      asmItem.span,
                      `Unsupported non-scalar argument form for "${param.name}" in call to "${asmItem.head}".`,
                    );
                    ok = false;
                    break;
                  }
                  pushedArgWords++;
                  continue;
                }
                const isByte = scalarKind === 'byte';

                if (isByte) {
                  if (arg.kind === 'Reg' && reg8.has(arg.name.toUpperCase())) {
                    ok = pushZeroExtendedReg8(arg.name.toUpperCase(), asmItem.span);
                    if (!ok) break;
                    pushedArgWords++;
                    continue;
                  }
                  if (arg.kind === 'Imm') {
                    const v = evalImmExpr(arg.expr, env, diagnostics);
                    if (v === undefined) {
                      if (arg.expr.kind === 'ImmName') {
                        ok = pushArgValueFromName(arg.expr.name, 'byte');
                        if (!ok) break;
                        pushedArgWords++;
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
                    pushedArgWords++;
                    continue;
                  }
                  if (arg.kind === 'Ea') {
                    const enumVal = enumValueFromEa(arg.expr);
                    if (enumVal !== undefined) {
                      ok = pushImm16(enumVal & 0xff, asmItem.span);
                      if (!ok) break;
                      pushedArgWords++;
                      continue;
                    }
                    ok = arg.explicitAddressOf
                      ? pushEaAddress(arg.expr, asmItem.span)
                      : pushArgValueFromEa(arg.expr, 'byte');
                    if (!ok) break;
                    pushedArgWords++;
                    continue;
                  }
                  if (arg.kind === 'Mem') {
                    ok = pushMemValue(arg.expr, 'byte', asmItem.span);
                    if (!ok) break;
                    pushedArgWords++;
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
                    pushedArgWords++;
                    continue;
                  }
                  if (arg.kind === 'Reg' && reg8.has(arg.name.toUpperCase())) {
                    ok = pushZeroExtendedReg8(arg.name.toUpperCase(), asmItem.span);
                    if (!ok) break;
                    pushedArgWords++;
                    continue;
                  }
                  if (arg.kind === 'Imm') {
                    const v = evalImmExpr(arg.expr, env, diagnostics);
                    if (v === undefined) {
                      if (arg.expr.kind === 'ImmName') {
                        ok = pushArgValueFromName(arg.expr.name, 'word');
                        if (!ok) break;
                        pushedArgWords++;
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
                    pushedArgWords++;
                    continue;
                  }
                  if (arg.kind === 'Ea') {
                    const enumVal = enumValueFromEa(arg.expr);
                    if (enumVal !== undefined) {
                      ok = pushImm16(enumVal & 0xffff, asmItem.span);
                      if (!ok) break;
                      pushedArgWords++;
                      continue;
                    }
                    ok = arg.explicitAddressOf
                      ? pushEaAddress(arg.expr, asmItem.span)
                      : pushArgValueFromEa(arg.expr, 'word');
                    if (!ok) break;
                    pushedArgWords++;
                    continue;
                  }
                  if (arg.kind === 'Mem') {
                    ok = pushMemValue(arg.expr, 'word', asmItem.span);
                    if (!ok) break;
                    pushedArgWords++;
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

              if (!ok) {
                for (let k = 0; k < pushedArgWords; k++) {
                  emitInstr('inc', [{ kind: 'Reg', span: asmItem.span, name: 'SP' }], asmItem.span);
                  emitInstr('inc', [{ kind: 'Reg', span: asmItem.span, name: 'SP' }], asmItem.span);
                }
                restorePreservedRegs();
                return;
              }

              diagIfCallStackUnverifiable({
                mnemonic: `typed call "${calleeName}"`,
                contractKind: 'typed-call',
              });
              if (callable.kind === 'extern') {
                emitAbs16Fixup(0xcd, callable.targetLower, 0, asmItem.span);
                // Externs are not preservation-safe by default (spec §8.2): do not push AF/BC/DE.
                for (let k = 0; k < args.length; k++) {
                  emitInstr('inc', [{ kind: 'Reg', span: asmItem.span, name: 'SP' }], asmItem.span);
                  emitInstr('inc', [{ kind: 'Reg', span: asmItem.span, name: 'SP' }], asmItem.span);
                }
                syncToFlow();
                return;
              } else {
                emitAbs16Fixup(0xcd, callable.node.name.toLowerCase(), 0, asmItem.span);
                for (let k = 0; k < args.length; k++) {
                  emitInstr('inc', [{ kind: 'Reg', span: asmItem.span, name: 'SP' }], asmItem.span);
                  emitInstr('inc', [{ kind: 'Reg', span: asmItem.span, name: 'SP' }], asmItem.span);
                }
                if (!restorePreservedRegs()) return;
                syncToFlow();
                return;
              }
            }

            const opCandidates = opsByName.get(asmItem.head.toLowerCase());
            if (opCandidates && opCandidates.length > 0) {
              const arityMatches = opCandidates.filter(
                (candidate) => candidate.params.length === asmItem.operands.length,
              );
              if (arityMatches.length === 0) {
                const available = opCandidates
                  .map((candidate) => `  - ${formatOpSignature(candidate)}`)
                  .join('\n');
                diagAtWithId(
                  diagnostics,
                  asmItem.span,
                  DiagnosticIds.OpArityMismatch,
                  `No op overload of "${asmItem.head}" accepts ${asmItem.operands.length} operand(s).\n` +
                    `available overloads:\n${available}`,
                );
                return;
              }

              const matches = arityMatches.filter((candidate) => {
                if (candidate.params.length !== asmItem.operands.length) return false;
                for (let idx = 0; idx < candidate.params.length; idx++) {
                  const param = candidate.params[idx]!;
                  const arg = asmItem.operands[idx]!;
                  if (!matcherMatchesOperand(param.matcher, arg)) return false;
                }
                return true;
              });
              if (matches.length === 0) {
                const operandSummary = asmItem.operands.map(formatAsmOperandForOpDiag).join(', ');
                const available = arityMatches
                  .map((candidate) => {
                    const reason = firstOpOverloadMismatchReason(candidate, asmItem.operands);
                    return `  - ${formatOpDefinitionForDiag(candidate)}${reason ? ` ; ${reason}` : ''}`;
                  })
                  .join('\n');
                diagAtWithId(
                  diagnostics,
                  asmItem.span,
                  DiagnosticIds.OpNoMatchingOverload,
                  `No matching op overload for "${asmItem.head}" with provided operands.\n` +
                    `call-site operands: (${operandSummary})\n` +
                    `available overloads:\n${available}`,
                );
                return;
              }
              const selected = selectMostSpecificOpOverload(matches, asmItem.operands);
              if (!selected) {
                const operandSummary = asmItem.operands.map(formatAsmOperandForOpDiag).join(', ');
                const equallySpecific = matches
                  .map((candidate) => `  - ${formatOpDefinitionForDiag(candidate)}`)
                  .join('\n');
                diagAtWithId(
                  diagnostics,
                  asmItem.span,
                  DiagnosticIds.OpAmbiguousOverload,
                  `Ambiguous op overload for "${asmItem.head}" (${matches.length} matches).\n` +
                    `call-site operands: (${operandSummary})\n` +
                    `equally specific candidates:\n${equallySpecific}`,
                );
                return;
              }
              const opDecl = selected;
              if (opStackPolicyMode !== 'off' && hasStackSlots) {
                const summary = summarizeOpStackEffect(opDecl);
                const severity = opStackPolicyMode === 'error' ? 'error' : 'warning';
                if (summary.kind === 'known') {
                  if (summary.hasUntrackedSpMutation) {
                    diagAtWithSeverityAndId(
                      diagnostics,
                      asmItem.span,
                      DiagnosticIds.OpStackPolicyRisk,
                      severity,
                      `op "${opDecl.name}" may mutate SP in an untracked way (static body analysis); invocation inside stack-slot function may invalidate stack verification.`,
                    );
                  }
                  if (summary.delta !== 0) {
                    diagAtWithSeverityAndId(
                      diagnostics,
                      asmItem.span,
                      DiagnosticIds.OpStackPolicyRisk,
                      severity,
                      `op "${opDecl.name}" has non-zero static stack delta (${summary.delta}) and is invoked inside a stack-slot function.`,
                    );
                  }
                }
              }
              const opKey = opDecl.name.toLowerCase();
              const cycleStart = opExpansionStack.findIndex((entry) => entry.key === opKey);
              if (cycleStart !== -1) {
                const cycleChain = [
                  ...opExpansionStack
                    .slice(cycleStart)
                    .map(
                      (entry) =>
                        `${entry.name} (${entry.declSpan.file}:${entry.declSpan.start.line})`,
                    ),
                  `${opDecl.name} (${opDecl.span.file}:${opDecl.span.start.line})`,
                ].join(' -> ');
                diagAtWithId(
                  diagnostics,
                  asmItem.span,
                  DiagnosticIds.OpExpansionCycle,
                  `Cyclic op expansion detected for "${opDecl.name}".\n` +
                    `expansion chain: ${cycleChain}`,
                );
                return;
              }
              const bindings = new Map<string, AsmOperandNode>();
              for (let idx = 0; idx < opDecl.params.length; idx++) {
                bindings.set(opDecl.params[idx]!.name.toLowerCase(), asmItem.operands[idx]!);
              }

              const bindingAsImmExpr = (
                bound: AsmOperandNode | undefined,
                span: SourceSpan,
              ): ImmExprNode | undefined => {
                if (!bound) return undefined;
                if (bound.kind === 'Imm') return cloneImmExpr(bound.expr);
                if (bound.kind !== 'Ea') return undefined;
                const name = flattenEaDottedName(bound.expr);
                if (!name || !env.enums.has(name)) return undefined;
                return { kind: 'ImmName', span, name };
              };

              const substituteImm = (expr: ImmExprNode): ImmExprNode => {
                const substituteOffsetofPath = (path: any): any => ({
                  ...path,
                  steps: path.steps.map((step: any) =>
                    step.kind === 'OffsetofIndex'
                      ? { ...step, expr: substituteImm(step.expr) }
                      : { ...step },
                  ),
                });
                if (expr.kind === 'ImmName') {
                  const bound = bindings.get(expr.name.toLowerCase());
                  const immBound = bindingAsImmExpr(bound, expr.span);
                  if (immBound) return immBound;
                  return { ...expr };
                }
                if (expr.kind === 'ImmOffsetof') {
                  return { ...expr, path: substituteOffsetofPath(expr.path) as typeof expr.path };
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
                  const immBound = bindingAsImmExpr(bound, operand.span);
                  if (immBound) return { kind: 'Imm', span: operand.span, expr: immBound };
                  if (bound) return cloneOperand(bound);
                  return { ...operand, expr: substituteImm(operand.expr) };
                }
                if (operand.kind === 'Imm')
                  return { ...operand, expr: substituteImm(operand.expr) };
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

              opExpansionStack.push({
                key: opKey,
                name: opDecl.name,
                declSpan: opDecl.span,
                callSiteSpan: asmItem.span,
              });
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
                  const substituteOffsetofPath = (path: any): any => ({
                    ...path,
                    steps: path.steps.map((step: any) =>
                      step.kind === 'OffsetofIndex'
                        ? { ...step, expr: substituteImmWithOpLabels(step.expr) }
                        : { ...step },
                    ),
                  });
                  if (expr.kind === 'ImmName') {
                    const bound = bindings.get(expr.name.toLowerCase());
                    const immBound = bindingAsImmExpr(bound, expr.span);
                    if (immBound) return immBound;
                    const mapped = localLabelMap.get(expr.name.toLowerCase());
                    if (mapped) return { kind: 'ImmName', span: expr.span, name: mapped };
                    return { ...expr };
                  }
                  if (expr.kind === 'ImmOffsetof') {
                    return { ...expr, path: substituteOffsetofPath(expr.path) as typeof expr.path };
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
                            : ea.index.kind === 'IndexMemIxIy' && ea.index.disp
                              ? { ...ea.index, disp: substituteImmWithOpLabels(ea.index.disp) }
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
                      const immBound = bindingAsImmExpr(bound, operand.span);
                      if (immBound) return { kind: 'Imm', span: operand.span, expr: immBound };
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
              emitRawCodeBytes(
                Uint8Array.of(opcode, value & 0xff),
                asmItem.span.file,
                `${mnemonic} ${value}`,
              );
              return true;
            };
            if (head === 'jr') {
              if (asmItem.operands.length === 1) {
                if (asmItem.operands[0]!.kind === 'Mem') {
                  diagAt(
                    diagnostics,
                    asmItem.span,
                    `jr does not support indirect targets; expects disp8`,
                  );
                  return;
                }
                const single = asmItem.operands[0]!;
                const ccSingle =
                  single.kind === 'Imm' && single.expr.kind === 'ImmName'
                    ? single.expr.name
                    : single.kind === 'Reg'
                      ? single.name
                      : undefined;
                if (ccSingle && jrConditionOpcodeFromName(ccSingle) !== undefined) {
                  diagAt(diagnostics, asmItem.span, `jr cc, disp expects two operands (cc, disp8)`);
                  return;
                }
                if (single.kind === 'Imm') {
                  const symbolicTarget = symbolicTargetFromExpr(single.expr);
                  if (
                    symbolicTarget &&
                    jrConditionOpcodeFromName(symbolicTarget.baseLower) !== undefined
                  ) {
                    diagAt(
                      diagnostics,
                      asmItem.span,
                      `jr cc, disp expects two operands (cc, disp8)`,
                    );
                    return;
                  }
                }
                if (single.kind === 'Reg') {
                  diagAt(
                    diagnostics,
                    asmItem.span,
                    `jr does not support register targets; expects disp8`,
                  );
                  return;
                }
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
                  diagAt(diagnostics, asmItem.span, `jr cc expects valid condition code NZ/Z/NC/C`);
                  return;
                }
                const target = asmItem.operands[1]!;
                if (target.kind === 'Mem') {
                  diagAt(
                    diagnostics,
                    asmItem.span,
                    `jr cc, disp does not support indirect targets`,
                  );
                  return;
                }
                if (target.kind === 'Reg') {
                  diagAt(
                    diagnostics,
                    asmItem.span,
                    `jr cc, disp does not support register targets; expects disp8`,
                  );
                  return;
                }
                if (target.kind !== 'Imm') {
                  diagAt(diagnostics, asmItem.span, `jr cc, disp expects disp8`);
                  return;
                }
                if (!emitRel8FromOperand(target, opcode, `jr ${ccName!.toLowerCase()}`)) return;
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
              if (target.kind === 'Mem') {
                diagAt(
                  diagnostics,
                  asmItem.span,
                  `djnz does not support indirect targets; expects disp8`,
                );
                return;
              }
              if (target.kind === 'Reg') {
                diagAt(
                  diagnostics,
                  asmItem.span,
                  `djnz does not support register targets; expects disp8`,
                );
                return;
              }
              if (target.kind !== 'Imm') {
                diagAt(diagnostics, asmItem.span, `djnz expects disp8`);
                return;
              }
              if (!emitRel8FromOperand(target, 0x10, 'djnz')) return;
              syncToFlow();
              return;
            }
            if (head === 'call') {
              diagIfCallStackUnverifiable();
            }
            if (head === 'rst' && asmItem.operands.length === 1) {
              diagIfCallStackUnverifiable({ mnemonic: 'rst' });
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
                if (emitSyntheticEpilogue) {
                  emitJumpCondTo(op, epilogueLabel, asmItem.span);
                } else {
                  emitJumpCondTo(op, epilogueLabel, asmItem.span);
                }
                syncToFlow();
                return;
              }
            }
            if ((head === 'retn' || head === 'reti') && asmItem.operands.length === 0) {
              diagIfRetStackImbalanced(head);
              if (emitSyntheticEpilogue) {
                diagAt(
                  diagnostics,
                  asmItem.span,
                  `${head} is not supported in functions that require cleanup; use ret/ret cc so cleanup epilogue can run.`,
                );
              }
              emitInstr(head, [], asmItem.span);
              flow.reachable = false;
              syncToFlow();
              return;
            }

            if (head === 'jp' && asmItem.operands.length === 1) {
              const target = asmItem.operands[0]!;
              if (target.kind === 'Imm') {
                const symbolicTarget = symbolicTargetFromExpr(target.expr);
                if (
                  symbolicTarget &&
                  conditionOpcodeFromName(symbolicTarget.baseLower) !== undefined
                ) {
                  diagAt(diagnostics, asmItem.span, `jp cc, nn expects two operands (cc, nn)`);
                  return;
                }
                if (symbolicTarget) {
                  emitAbs16Fixup(
                    0xc3,
                    symbolicTarget.baseLower,
                    symbolicTarget.addend,
                    asmItem.span,
                  );
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
                if (
                  symbolicTarget &&
                  callConditionOpcodeFromName(symbolicTarget.baseLower) !== undefined
                ) {
                  diagAt(diagnostics, asmItem.span, `call cc, nn expects two operands (cc, nn)`);
                  return;
                }
                if (symbolicTarget) {
                  warnIfRawCallTargetsTypedCallable(symbolicTarget);
                  emitAbs16Fixup(
                    0xcd,
                    symbolicTarget.baseLower,
                    symbolicTarget.addend,
                    asmItem.span,
                  );
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
                  warnIfRawCallTargetsTypedCallable(symbolicTarget);
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
              if (
                opcode !== undefined &&
                srcOp.kind === 'Imm' &&
                srcOp.expr.kind === 'ImmName' &&
                !resolveScalarBinding(srcOp.expr.name)
              ) {
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
                srcOp.expr.kind === 'ImmName' &&
                !resolveScalarBinding(srcOp.expr.name)
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

            if (!emitInstr(asmItem.head, asmItem.operands, asmItem.span)) return;

            if ((head === 'jp' || head === 'jr') && asmItem.operands.length === 1) {
              flow.reachable = false;
            } else if (
              (head === 'ret' || head === 'retn' || head === 'reti') &&
              asmItem.operands.length === 0
            ) {
              flow.reachable = false;
            }
            syncToFlow();
          } finally {
            appendInvalidOpExpansionDiagnostic(asmItem, diagnosticsStart);
            currentCodeSegmentTag = prevTag;
          }
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
            const prevTag = currentCodeSegmentTag;
            currentCodeSegmentTag = sourceTagForSpan(it.span);
            try {
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
                let backEdgeUnknown = false;
                let backEdgeMutation = false;
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
                  backEdgeUnknown = true;
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
                  backEdgeUnknown = true;
                  backEdgeMutation = true;
                  diagAt(
                    diagnostics,
                    asmItems[j]!.span,
                    `Cannot verify stack depth at while back-edge due to untracked SP mutation.`,
                  );
                } else if (
                  bodyExit.reachable &&
                  (!bodyExit.spValid || !entry.spValid) &&
                  hasStackSlots
                ) {
                  backEdgeUnknown = true;
                  diagAt(
                    diagnostics,
                    asmItems[j]!.span,
                    `Cannot verify stack depth at while back-edge due to unknown stack state.`,
                  );
                }
                if (bodyExit.reachable) emitJumpTo(condLabel, asmItems[j]!.span);
                defineCodeLabel(endLabel, asmItems[j]!.span, 'local');
                if (backEdgeUnknown) {
                  restoreFlow({
                    reachable: entry.reachable,
                    spDelta: 0,
                    spValid: false,
                    spInvalidDueToMutation: backEdgeMutation,
                  });
                } else {
                  restoreFlow(entry);
                }
                i = j + 1;
                continue;
              }
              if (it.kind === 'Repeat') {
                const entry = snapshotFlow();
                const loopLabel = newHiddenLabel('__zax_repeat_body');
                let backEdgeUnknown = false;
                let backEdgeMutation = false;
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
                  backEdgeUnknown = true;
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
                  backEdgeUnknown = true;
                  backEdgeMutation = true;
                  diagAt(
                    diagnostics,
                    untilNode.span,
                    `Cannot verify stack depth at repeat/until due to untracked SP mutation.`,
                  );
                } else if (
                  bodyExit.reachable &&
                  (!bodyExit.spValid || !entry.spValid) &&
                  hasStackSlots
                ) {
                  backEdgeUnknown = true;
                  diagAt(
                    diagnostics,
                    untilNode.span,
                    `Cannot verify stack depth at repeat/until due to unknown stack state.`,
                  );
                }
                if (backEdgeUnknown) {
                  restoreFlow({
                    reachable: bodyExit.reachable,
                    spDelta: 0,
                    spValid: false,
                    spInvalidDueToMutation: backEdgeMutation,
                  });
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
                  diagAt(
                    diagnostics,
                    it.span,
                    `select must contain at least one case or else arm.`,
                  );
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
                    emitRawCodeBytes(Uint8Array.of(0x7d), it.span.file, 'ld a, l');
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
                  let hasMismatch = false;
                  if (allValid) {
                    const mismatchFlow = reachable.find((f) => f.spDelta !== base.spDelta);
                    if (mismatchFlow) {
                      hasMismatch = true;
                      diagAt(
                        diagnostics,
                        asmItems[j]!.span,
                        `Stack depth mismatch at select join (${base.spDelta} vs ${mismatchFlow.spDelta}).`,
                      );
                    }
                  } else if (reachable.some((f) => f.spInvalidDueToMutation)) {
                    diagAt(
                      diagnostics,
                      asmItems[j]!.span,
                      `Cannot verify stack depth at select join due to untracked SP mutation.`,
                    );
                  } else if (hasStackSlots) {
                    diagAt(
                      diagnostics,
                      asmItems[j]!.span,
                      `Cannot verify stack depth at select join due to unknown stack state.`,
                    );
                  }
                  restoreFlow({
                    reachable: true,
                    spDelta: base.spDelta,
                    spValid: allValid && !hasMismatch,
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
            } finally {
              currentCodeSegmentTag = prevTag;
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
        } else if (flow.reachable && !flow.spValid && hasStackSlots) {
          diagAt(
            diagnostics,
            item.span,
            `Function "${item.name}" has unknown stack depth at fallthrough; cannot verify stack balance.`,
          );
        }
        if (!emitSyntheticEpilogue && flow.reachable) {
          withCodeSourceTag(sourceTagForSpan(item.span), () => {
            emitInstr('ret', [], item.span);
          });
          flow.reachable = false;
          syncToFlow();
        }

        if (emitSyntheticEpilogue) {
          withCodeSourceTag(sourceTagForSpan(item.span), () => {
            // When control can fall through to the end of the function body, route it through the
            // synthetic epilogue. If flow is unreachable here (e.g. a terminal `ret`), avoid emitting
            // a dead jump before the epilogue label. If flow is reachable, fall through directly.
            pending.push({
              kind: 'label',
              name: epilogueLabel,
              section: 'code',
              offset: codeOffset,
              file: item.span.file,
              line: item.span.start.line,
              scope: 'local',
            });
            traceLabel(codeOffset, epilogueLabel);
            if (shouldPreserveTypedBoundary) {
              for (let ri = preserveSet.length - 1; ri >= 0; ri--) {
                emitInstr(
                  'pop',
                  [{ kind: 'Reg', span: item.span, name: preserveSet[ri]! }],
                  item.span,
                );
              }
            }
            if (hasStackSlots) {
              emitInstr(
                'ld',
                [
                  { kind: 'Reg', span: item.span, name: 'SP' },
                  { kind: 'Reg', span: item.span, name: 'IX' },
                ],
                item.span,
              );
              emitInstr('pop', [{ kind: 'Reg', span: item.span, name: 'IX' }], item.span);
            }
            emitInstr('ret', [], item.span);
          });
        }
        traceComment(codeOffset, `func ${item.name} end`);
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
          const nextPow2 = (value: number): number => {
            if (value <= 1) return value;
            let pow = 1;
            while (pow < value) pow <<= 1;
            return pow;
          };

          const recordType = resolveAggregateType(type);
          if (recordType?.kind === 'record') {
            if (init.kind === 'InitString') {
              diag(
                diagnostics,
                decl.span.file,
                `Record initializer for "${decl.name}" must use aggregate form.`,
              );
              continue;
            }

            const valuesByField = new Map<string, ImmExprNode>();
            let recordInitFailed = false;
            if (init.kind === 'InitRecordNamed') {
              for (const fieldInit of init.fields) {
                const field = recordType.fields.find((f) => f.name === fieldInit.name);
                if (!field) {
                  diag(
                    diagnostics,
                    decl.span.file,
                    `Unknown record field "${fieldInit.name}" in initializer for "${decl.name}".`,
                  );
                  recordInitFailed = true;
                  continue;
                }
                if (valuesByField.has(field.name)) {
                  diag(
                    diagnostics,
                    decl.span.file,
                    `Duplicate record field "${field.name}" in initializer for "${decl.name}".`,
                  );
                  recordInitFailed = true;
                  continue;
                }
                valuesByField.set(field.name, fieldInit.value);
              }
              for (const field of recordType.fields) {
                if (valuesByField.has(field.name)) continue;
                diag(
                  diagnostics,
                  decl.span.file,
                  `Missing record field "${field.name}" in initializer for "${decl.name}".`,
                );
                recordInitFailed = true;
              }
            } else {
              if (init.elements.length !== recordType.fields.length) {
                diag(
                  diagnostics,
                  decl.span.file,
                  `Record initializer field count mismatch for "${decl.name}".`,
                );
                continue;
              }
              for (let index = 0; index < recordType.fields.length; index++) {
                const field = recordType.fields[index]!;
                const element = init.elements[index]!;
                valuesByField.set(field.name, element);
              }
            }
            if (recordInitFailed) continue;

            const encodedFields: Array<{ width: 1 | 2; value: number }> = [];
            for (const field of recordType.fields) {
              const fieldValueExpr = valuesByField.get(field.name);
              if (!fieldValueExpr) continue;
              const scalar = resolveScalarKind(field.typeExpr);
              if (!scalar) {
                diag(
                  diagnostics,
                  decl.span.file,
                  `Unsupported record field type "${field.name}" in initializer for "${decl.name}" (expected byte/word/addr/ptr).`,
                );
                recordInitFailed = true;
                continue;
              }
              const value = evalImmExpr(fieldValueExpr, env, diagnostics);
              if (value === undefined) {
                diag(
                  diagnostics,
                  decl.span.file,
                  `Failed to evaluate data initializer for "${decl.name}".`,
                );
                recordInitFailed = true;
                continue;
              }
              encodedFields.push({
                width: scalar === 'byte' ? 1 : 2,
                value,
              });
            }
            if (recordInitFailed) continue;

            let emitted = 0;
            for (const encoded of encodedFields) {
              if (encoded.width === 1) {
                emitByte(encoded.value);
                emitted += 1;
              } else {
                emitWord(encoded.value);
                emitted += 2;
              }
            }
            const storageBytes = sizeOfTypeExpr(type, env, diagnostics);
            if (storageBytes === undefined) continue;
            for (let pad = emitted; pad < storageBytes; pad++) emitByte(0);
            continue;
          }

          if (init.kind === 'InitRecordNamed') {
            diag(
              diagnostics,
              decl.span.file,
              `Named-field aggregate initializer requires a record type for "${decl.name}".`,
            );
            continue;
          }

          const elementScalar =
            type.kind === 'ArrayType' ? resolveScalarKind(type.element) : resolveScalarKind(type);
          const elementSize =
            elementScalar === 'word' || elementScalar === 'addr'
              ? 2
              : elementScalar === 'byte'
                ? 1
                : undefined;
          if (!elementSize) {
            diag(
              diagnostics,
              decl.span.file,
              `Unsupported data type for "${decl.name}" (expected byte/word/addr/ptr or fixed-length arrays of those).`,
            );
            continue;
          }

          const declaredLength = type.kind === 'ArrayType' ? type.length : 1;
          let actualLength = declaredLength ?? 0;

          if (init.kind === 'InitString') {
            if (elementSize !== 1) {
              diag(
                diagnostics,
                decl.span.file,
                `String initializer requires byte element type for "${decl.name}".`,
              );
              continue;
            }
            if (declaredLength !== undefined && init.value.length !== declaredLength) {
              diag(diagnostics, decl.span.file, `String length mismatch for "${decl.name}".`);
              continue;
            }
            for (let idx = 0; idx < init.value.length; idx++) {
              emitByte(init.value.charCodeAt(idx));
            }
            actualLength = init.value.length;
            if (type.kind === 'ArrayType') {
              const emittedBytes = actualLength * elementSize;
              const storageBytes = nextPow2(emittedBytes);
              for (let pad = emittedBytes; pad < storageBytes; pad++) emitByte(0);
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

          if (declaredLength !== undefined && values.length !== declaredLength) {
            diag(diagnostics, decl.span.file, `Initializer length mismatch for "${decl.name}".`);
            continue;
          }

          for (const v of values) {
            if (elementSize === 1) emitByte(v);
            else emitWord(v);
          }
          actualLength = type.kind === 'ArrayType' ? values.length : 1;
          if (type.kind === 'ArrayType') {
            const emittedBytes = actualLength * elementSize;
            const storageBytes = nextPow2(emittedBytes);
            for (let pad = emittedBytes; pad < storageBytes; pad++) emitByte(0);
          }
        }
        continue;
      }

      if (item.kind === 'VarBlock' && item.scope === 'module') {
        const varBlock = item as VarBlockNode;
        for (const decl of varBlock.decls) {
          if (!decl.typeExpr) continue;
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
  const fallbackCodeBase = options?.defaultCodeBase ?? 0;
  const codeBase = explicitCodeBase ?? fallbackCodeBase;

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
  const sourceSegments = codeOk
    ? codeSourceSegments
        .map((segment) => ({
          ...segment,
          start: codeBase + segment.start,
          end: codeBase + segment.end,
        }))
        .filter(
          (segment) => segment.start >= 0 && segment.end <= 0x10000 && segment.end > segment.start,
        )
    : [];
  const asmTrace = codeOk
    ? codeAsmTrace
        .map((entry) => ({ ...entry, offset: codeBase + entry.offset }))
        .filter((entry) => entry.offset >= 0 && entry.offset <= 0xffff)
    : [];

  return {
    map: {
      bytes,
      writtenRange,
      ...(sourceSegments.length > 0 ? { sourceSegments } : {}),
      ...(asmTrace.length > 0 ? { asmTrace } : {}),
    },
    symbols,
  };
}

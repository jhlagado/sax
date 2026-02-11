import type { Diagnostic } from '../diagnostics/types.js';
import { DiagnosticIds } from '../diagnostics/types.js';
import type {
  AsmInstructionNode,
  AsmOperandNode,
  EaExprNode,
  ImmExprNode,
} from '../frontend/ast.js';
import type { CompileEnv } from '../semantics/env.js';
import { evalImmExpr } from '../semantics/env.js';

function diag(
  diagnostics: Diagnostic[],
  node: { span: { file: string; start: { line: number; column: number } } },
  message: string,
): void {
  diagnostics.push({
    id: DiagnosticIds.EncodeError,
    severity: 'error',
    message,
    file: node.span.file,
    line: node.span.start.line,
    column: node.span.start.column,
  });
}

function immValue(op: AsmOperandNode, env: CompileEnv): number | undefined {
  if (op.kind !== 'Imm') return undefined;
  return evalImmExpr(op.expr, env);
}

function portImmValue(op: AsmOperandNode, env: CompileEnv): number | undefined {
  if (op.kind !== 'PortImm8') return undefined;
  return evalImmExpr(op.expr, env);
}

function regName(op: AsmOperandNode): string | undefined {
  return op.kind === 'Reg' ? op.name.toUpperCase() : undefined;
}

function reg8Code(name: string): number | undefined {
  switch (name.toUpperCase()) {
    case 'B':
      return 0;
    case 'C':
      return 1;
    case 'D':
      return 2;
    case 'E':
      return 3;
    case 'H':
      return 4;
    case 'L':
      return 5;
    case 'A':
      return 7;
    default:
      return undefined;
  }
}

function isLegacyHLReg8(name: string | undefined): boolean {
  return name === 'H' || name === 'L';
}

function indexedReg8(
  op: AsmOperandNode,
): { prefix: number; code: number; display: 'IXH' | 'IXL' | 'IYH' | 'IYL' } | undefined {
  const n = regName(op);
  switch (n) {
    case 'IXH':
      return { prefix: 0xdd, code: 4, display: 'IXH' };
    case 'IXL':
      return { prefix: 0xdd, code: 5, display: 'IXL' };
    case 'IYH':
      return { prefix: 0xfd, code: 4, display: 'IYH' };
    case 'IYL':
      return { prefix: 0xfd, code: 5, display: 'IYL' };
    default:
      return undefined;
  }
}

function reg16Name(op: AsmOperandNode): string | undefined {
  if (op.kind !== 'Reg') return undefined;
  const n = op.name.toUpperCase();
  return n === 'BC' || n === 'DE' || n === 'HL' || n === 'SP' || n === 'AF' ? n : undefined;
}

function isMemHL(op: AsmOperandNode): boolean {
  return op.kind === 'Mem' && op.expr.kind === 'EaName' && op.expr.name.toUpperCase() === 'HL';
}

function isMemRegName(op: AsmOperandNode, reg: string): boolean {
  return op.kind === 'Mem' && op.expr.kind === 'EaName' && op.expr.name.toUpperCase() === reg;
}

function isReg16TransferName(name: string | undefined): boolean {
  return (
    name === 'BC' ||
    name === 'DE' ||
    name === 'HL' ||
    name === 'SP' ||
    name === 'AF' ||
    name === 'IX' ||
    name === 'IY'
  );
}

function memIndexed(
  op: AsmOperandNode,
  env: CompileEnv,
): { prefix: number; disp: number } | undefined {
  if (op.kind !== 'Mem') return undefined;
  const ea = op.expr;
  const encodeBaseDisp = (
    baseExpr: EaExprNode,
    dispExpr: ImmExprNode,
    negate = false,
  ): { prefix: number; disp: number } | undefined => {
    if (baseExpr.kind !== 'EaName') return undefined;
    const base = baseExpr.name.toUpperCase();
    if (base !== 'IX' && base !== 'IY') return undefined;
    const rawDisp = evalImmExpr(dispExpr, env);
    if (rawDisp === undefined) return undefined;
    const prefix = base === 'IX' ? 0xdd : 0xfd;
    return { prefix, disp: negate ? -rawDisp : rawDisp };
  };

  if (ea.kind === 'EaIndex' && ea.index.kind === 'IndexImm') {
    return encodeBaseDisp(ea.base, ea.index.value);
  }
  if (ea.kind === 'EaName') {
    const base = ea.name.toUpperCase();
    if (base === 'IX') return { prefix: 0xdd, disp: 0 };
    if (base === 'IY') return { prefix: 0xfd, disp: 0 };
  }
  if (ea.kind === 'EaAdd') {
    return encodeBaseDisp(ea.base, ea.offset);
  }
  if (ea.kind === 'EaSub') {
    return encodeBaseDisp(ea.base, ea.offset, true);
  }
  return undefined;
}

function memAbs16(op: AsmOperandNode, env: CompileEnv): number | undefined {
  if (op.kind !== 'Mem') return undefined;

  const evalEaAbs16 = (ea: EaExprNode): number | undefined => {
    switch (ea.kind) {
      case 'EaName':
        return evalImmExpr(
          {
            kind: 'ImmName',
            span: ea.span,
            name: ea.name,
          },
          env,
        );
      case 'EaAdd': {
        const base = evalEaAbs16(ea.base);
        const delta = evalImmExpr(ea.offset, env);
        if (base === undefined || delta === undefined) return undefined;
        return base + delta;
      }
      case 'EaSub': {
        const base = evalEaAbs16(ea.base);
        const delta = evalImmExpr(ea.offset, env);
        if (base === undefined || delta === undefined) return undefined;
        return base - delta;
      }
      default:
        return undefined;
    }
  };

  return evalEaAbs16(op.expr);
}

function conditionName(op: AsmOperandNode): string | undefined {
  if (op.kind === 'Reg') return op.name.toUpperCase();
  if (op.kind === 'Imm' && op.expr.kind === 'ImmName') return op.expr.name.toUpperCase();
  return undefined;
}

function jpConditionOpcode(name: string): number | undefined {
  switch (name) {
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
}

function jrConditionOpcode(name: string): number | undefined {
  switch (name) {
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
}

function callConditionOpcode(name: string): number | undefined {
  switch (name) {
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
}

function retConditionOpcode(name: string): number | undefined {
  switch (name) {
    case 'NZ':
      return 0xc0;
    case 'Z':
      return 0xc8;
    case 'NC':
      return 0xd0;
    case 'C':
      return 0xd8;
    case 'PO':
      return 0xe0;
    case 'PE':
      return 0xe8;
    case 'P':
      return 0xf0;
    case 'M':
      return 0xf8;
    default:
      return undefined;
  }
}

function zeroOperandEdOpcode(head: string): number | undefined {
  switch (head) {
    case 'reti':
      return 0x4d;
    case 'retn':
      return 0x45;
    case 'neg':
      return 0x44;
    case 'rrd':
      return 0x67;
    case 'rld':
      return 0x6f;
    case 'ldi':
      return 0xa0;
    case 'ldir':
      return 0xb0;
    case 'ldd':
      return 0xa8;
    case 'lddr':
      return 0xb8;
    case 'cpi':
      return 0xa1;
    case 'cpir':
      return 0xb1;
    case 'cpd':
      return 0xa9;
    case 'cpdr':
      return 0xb9;
    case 'ini':
      return 0xa2;
    case 'inir':
      return 0xb2;
    case 'ind':
      return 0xaa;
    case 'indr':
      return 0xba;
    case 'outi':
      return 0xa3;
    case 'otir':
      return 0xb3;
    case 'outd':
      return 0xab;
    case 'otdr':
      return 0xbb;
    default:
      return undefined;
  }
}

function zeroOperandOpcode(head: string): Uint8Array | undefined {
  switch (head) {
    case 'nop':
      return Uint8Array.of(0x00);
    case 'halt':
      return Uint8Array.of(0x76);
    case 'di':
      return Uint8Array.of(0xf3);
    case 'ei':
      return Uint8Array.of(0xfb);
    case 'scf':
      return Uint8Array.of(0x37);
    case 'ccf':
      return Uint8Array.of(0x3f);
    case 'cpl':
      return Uint8Array.of(0x2f);
    case 'daa':
      return Uint8Array.of(0x27);
    case 'rlca':
      return Uint8Array.of(0x07);
    case 'rrca':
      return Uint8Array.of(0x0f);
    case 'rla':
      return Uint8Array.of(0x17);
    case 'rra':
      return Uint8Array.of(0x1f);
    case 'exx':
      return Uint8Array.of(0xd9);
    default: {
      const edOpcode = zeroOperandEdOpcode(head);
      return edOpcode === undefined ? undefined : Uint8Array.of(0xed, edOpcode);
    }
  }
}

function arityDiagnostic(head: string, operandCount: number): string | undefined {
  switch (head) {
    case 'add':
    case 'ld':
    case 'ex':
      if (operandCount === 2) return undefined;
      return `${head} expects two operands`;
    case 'sub':
    case 'cp':
    case 'and':
    case 'or':
    case 'xor':
      if (operandCount === 1 || operandCount === 2) return undefined;
      return `${head} expects one operand, or two with destination A`;
    case 'adc':
    case 'sbc':
      if (operandCount === 1 || operandCount === 2) return undefined;
      return `${head} expects one operand, two with destination A, or HL,rr form`;
    case 'inc':
    case 'dec':
    case 'push':
    case 'pop':
      if (operandCount === 1) return undefined;
      return `${head} expects one operand`;
    case 'bit':
      if (operandCount === 2) return undefined;
      return `${head} expects two operands`;
    case 'res':
    case 'set':
      if (operandCount === 2 || operandCount === 3) return undefined;
      return `${head} expects two operands, or three with indexed source + reg8 destination`;
    case 'rl':
    case 'rr':
    case 'sla':
    case 'sra':
    case 'srl':
    case 'sll':
    case 'rlc':
    case 'rrc':
      if (operandCount === 1 || operandCount === 2) return undefined;
      return `${head} expects one operand, or two with indexed source + reg8 destination`;
    default:
      return undefined;
  }
}

function isKnownInstructionHead(head: string): boolean {
  const h = head.toLowerCase();
  switch (h) {
    case 'ret':
    case 'add':
    case 'call':
    case 'djnz':
    case 'rst':
    case 'im':
    case 'in':
    case 'out':
    case 'jp':
    case 'jr':
    case 'ld':
    case 'inc':
    case 'dec':
    case 'push':
    case 'pop':
    case 'ex':
    case 'sub':
    case 'cp':
    case 'and':
    case 'or':
    case 'xor':
    case 'adc':
    case 'sbc':
    case 'bit':
    case 'res':
    case 'set':
    case 'rl':
    case 'rr':
    case 'sla':
    case 'sra':
    case 'srl':
    case 'sll':
    case 'rlc':
    case 'rrc':
      return true;
    default:
      return zeroOperandOpcode(h) !== undefined;
  }
}

/**
 * Encode a single `asm` instruction node into Z80 machine-code bytes.
 *
 * PR2 implementation note:
 * - Supports only a tiny subset: `nop`, `ret`, `jp imm16`, `ld A, imm8`, `ld HL, imm16`.
 * - Immediate operands may be `imm` expressions (const/enum names and operators), evaluated via the env.
 * - On unsupported forms, appends an error diagnostic and returns `undefined`.
 */
export function encodeInstruction(
  node: AsmInstructionNode,
  env: CompileEnv,
  diagnostics: Diagnostic[],
): Uint8Array | undefined {
  const diagnosticsBefore = diagnostics.length;
  const head = node.head.toLowerCase();
  const ops = node.operands;

  if (head === 'ret' && ops.length === 0) return Uint8Array.of(0xc9);
  if (head === 'ret' && ops.length === 1) {
    const cc = conditionName(ops[0]!);
    const opcode = cc ? retConditionOpcode(cc) : undefined;
    if (opcode === undefined) {
      diag(diagnostics, node, `ret cc expects a valid condition code`);
      return undefined;
    }
    return Uint8Array.of(opcode);
  }
  if (head === 'ret') {
    diag(diagnostics, node, `ret expects no operands or one condition code`);
    return undefined;
  }
  const zeroOpcode = zeroOperandOpcode(head);
  if (zeroOpcode) {
    if (ops.length === 0) return zeroOpcode;
    diag(diagnostics, node, `${head} expects no operands`);
    return undefined;
  }

  if (head === 'add' && ops.length === 2) {
    const dst = regName(ops[0]!);
    const src = regName(ops[1]!);

    if (dst === 'A') {
      const indexedSrc = indexedReg8(ops[1]!);
      if (indexedSrc) return Uint8Array.of(indexedSrc.prefix, 0x80 + indexedSrc.code);
      if (src) {
        const s = reg8Code(src);
        if (s !== undefined) return Uint8Array.of(0x80 + s);
      }
      if (isMemHL(ops[1]!)) return Uint8Array.of(0x86);
      const idx = memIndexed(ops[1]!, env);
      if (idx) {
        const disp = idx.disp;
        if (disp < -128 || disp > 127) {
          diag(diagnostics, node, `add A, (ix/iy+disp) expects disp8`);
          return undefined;
        }
        return Uint8Array.of(idx.prefix, 0x86, disp & 0xff);
      }
      const n = immValue(ops[1]!, env);
      if (n !== undefined) {
        if (n < 0 || n > 0xff) {
          diag(diagnostics, node, `add A, n expects imm8`);
          return undefined;
        }
        return Uint8Array.of(0xc6, n & 0xff);
      }
      diag(diagnostics, node, `add A, src expects reg8/imm8/(hl)/(ix/iy+disp)`);
      return undefined;
    }

    if (dst === 'HL' && src) {
      switch (src) {
        case 'BC':
          return Uint8Array.of(0x09);
        case 'DE':
          return Uint8Array.of(0x19);
        case 'HL':
          return Uint8Array.of(0x29);
        case 'SP':
          return Uint8Array.of(0x39);
      }
      diag(diagnostics, node, `add HL, rr expects BC/DE/HL/SP`);
      return undefined;
    }
    if (dst === 'HL') {
      diag(diagnostics, node, `add HL, rr expects BC/DE/HL/SP`);
      return undefined;
    }

    if ((dst === 'IX' || dst === 'IY') && src) {
      const prefix = dst === 'IX' ? 0xdd : 0xfd;
      switch (src) {
        case 'BC':
          return Uint8Array.of(prefix, 0x09);
        case 'DE':
          return Uint8Array.of(prefix, 0x19);
        case 'SP':
          return Uint8Array.of(prefix, 0x39);
        case 'IX':
          if (dst === 'IX') return Uint8Array.of(0xdd, 0x29);
          break;
        case 'IY':
          if (dst === 'IY') return Uint8Array.of(0xfd, 0x29);
          break;
      }
      diag(diagnostics, node, `add ${dst}, rr supports BC/DE/SP and same-index pair only`);
      return undefined;
    }
    if (dst === 'IX' || dst === 'IY') {
      diag(diagnostics, node, `add ${dst}, rr supports BC/DE/SP and same-index pair only`);
      return undefined;
    }

    diag(diagnostics, node, `add expects destination A, HL, IX, or IY`);
    return undefined;
  }

  if (head === 'call' && ops.length === 1) {
    const n = immValue(ops[0]!, env);
    if (n === undefined || n < 0 || n > 0xffff) {
      diag(diagnostics, node, `call expects imm16`);
      return undefined;
    }
    return Uint8Array.of(0xcd, n & 0xff, (n >> 8) & 0xff);
  }
  if (head === 'call' && ops.length === 2) {
    const cc = conditionName(ops[0]!);
    const opcode = cc ? callConditionOpcode(cc) : undefined;
    const n = immValue(ops[1]!, env);
    if (opcode === undefined || n === undefined || n < 0 || n > 0xffff) {
      diag(diagnostics, node, `call cc, nn expects condition + imm16`);
      return undefined;
    }
    return Uint8Array.of(opcode, n & 0xff, (n >> 8) & 0xff);
  }
  if (head === 'call') {
    diag(diagnostics, node, `call expects one operand (nn) or two operands (cc, nn)`);
    return undefined;
  }

  if (head === 'djnz' && ops.length === 1) {
    const n = immValue(ops[0]!, env);
    if (n === undefined || n < -128 || n > 127) {
      diag(diagnostics, node, `djnz expects disp8`);
      return undefined;
    }
    return Uint8Array.of(0x10, n & 0xff);
  }
  if (head === 'djnz') {
    diag(diagnostics, node, `djnz expects one operand (disp8)`);
    return undefined;
  }

  if (head === 'rst' && ops.length === 1) {
    const n = immValue(ops[0]!, env);
    if (n === undefined || n < 0 || n > 0x38 || (n & 0x07) !== 0) {
      diag(diagnostics, node, `rst expects an imm8 multiple of 8 (0..56)`);
      return undefined;
    }
    return Uint8Array.of(0xc7 + n);
  }
  if (head === 'rst') {
    diag(diagnostics, node, `rst expects one operand`);
    return undefined;
  }

  if (head === 'im' && ops.length === 1) {
    const n = immValue(ops[0]!, env);
    if (n === 0) return Uint8Array.of(0xed, 0x46);
    if (n === 1) return Uint8Array.of(0xed, 0x56);
    if (n === 2) return Uint8Array.of(0xed, 0x5e);
    diag(diagnostics, node, `im expects 0, 1, or 2`);
    return undefined;
  }
  if (head === 'im') {
    diag(diagnostics, node, `im expects one operand`);
    return undefined;
  }

  if (head === 'ld' && ops.length === 2) {
    const dst = regName(ops[0]!);
    const src = regName(ops[1]!);
    if (dst === 'I' && src === 'A') return Uint8Array.of(0xed, 0x47);
    if (dst === 'A' && src === 'I') return Uint8Array.of(0xed, 0x57);
    if (dst === 'R' && src === 'A') return Uint8Array.of(0xed, 0x4f);
    if (dst === 'A' && src === 'R') return Uint8Array.of(0xed, 0x5f);
  }

  if (head === 'in' && ops.length === 1) {
    if (ops[0]!.kind === 'PortC') {
      // in (c) => ED 70
      return Uint8Array.of(0xed, 0x70);
    }
    diag(diagnostics, node, `in (c) is the only one-operand in form`);
    return undefined;
  }

  if (head === 'in' && ops.length === 2) {
    const dst = regName(ops[0]!);
    const dst8 = dst ? reg8Code(dst) : undefined;

    if (dst8 === undefined) {
      if (indexedReg8(ops[0]!)) {
        diag(diagnostics, node, `in destination must use legacy reg8 B/C/D/E/H/L/A`);
        return undefined;
      }
      diag(diagnostics, node, `in expects a reg8 destination`);
      return undefined;
    }

    const port = ops[1]!;
    if (port.kind === 'PortC') {
      // in r,(c) => ED 40 + r*8
      return Uint8Array.of(0xed, 0x40 + (dst8 << 3));
    }
    if (port.kind === 'PortImm8') {
      // in a,(n) => DB n
      if (dst !== 'A') {
        diag(diagnostics, node, `in a,(n) immediate port form requires destination A`);
        return undefined;
      }
      const n = portImmValue(port, env);
      if (n === undefined || n < 0 || n > 0xff) {
        diag(diagnostics, node, `in a,(n) expects an imm8 port number`);
        return undefined;
      }
      return Uint8Array.of(0xdb, n & 0xff);
    }

    diag(diagnostics, node, `in expects a port operand (c) or (imm8)`);
    return undefined;
  }
  if (head === 'in') {
    diag(diagnostics, node, `in expects one or two operands`);
    return undefined;
  }

  if (head === 'out' && ops.length === 2) {
    const port = ops[0]!;
    const src = regName(ops[1]!);
    const src8 = src ? reg8Code(src) : undefined;
    const srcIndexed = indexedReg8(ops[1]!);

    if (port.kind === 'PortC') {
      if (ops[1]!.kind === 'Imm') {
        const n = evalImmExpr(ops[1]!.expr, env);
        if (n === 0) {
          // out (c),0 => ED 71
          return Uint8Array.of(0xed, 0x71);
        }
        diag(diagnostics, node, `out (c), n immediate form supports n=0 only`);
        return undefined;
      }
      if (src8 === undefined) {
        if (srcIndexed) {
          diag(diagnostics, node, `out source must use legacy reg8 B/C/D/E/H/L/A`);
          return undefined;
        }
        diag(diagnostics, node, `out expects a reg8 source`);
        return undefined;
      }
      // out (c),r => ED 41 + r*8
      return Uint8Array.of(0xed, 0x41 + (src8 << 3));
    }
    if (port.kind === 'PortImm8') {
      // out (n),a => D3 n
      if (src8 === undefined) {
        if (srcIndexed) {
          diag(diagnostics, node, `out source must use legacy reg8 B/C/D/E/H/L/A`);
          return undefined;
        }
        diag(diagnostics, node, `out expects a reg8 source`);
        return undefined;
      }
      if (src !== 'A') {
        diag(diagnostics, node, `out (n),a immediate port form requires source A`);
        return undefined;
      }
      const n = portImmValue(port, env);
      if (n === undefined || n < 0 || n > 0xff) {
        diag(diagnostics, node, `out (n),a expects an imm8 port number`);
        return undefined;
      }
      return Uint8Array.of(0xd3, n & 0xff);
    }

    diag(diagnostics, node, `out expects a port operand (c) or (imm8)`);
    return undefined;
  }
  if (head === 'out') {
    diag(diagnostics, node, `out expects two operands`);
    return undefined;
  }

  if (head === 'jp' && ops.length === 1) {
    // jp (hl) / jp (ix) / jp (iy)
    if (ops[0]!.kind === 'Mem') {
      if (isMemRegName(ops[0]!, 'HL')) return Uint8Array.of(0xe9);
      if (isMemRegName(ops[0]!, 'IX')) return Uint8Array.of(0xdd, 0xe9);
      if (isMemRegName(ops[0]!, 'IY')) return Uint8Array.of(0xfd, 0xe9);
      diag(diagnostics, node, `jp indirect form supports (hl), (ix), or (iy) only`);
      return undefined;
    }

    const n = immValue(ops[0]!, env);
    if (n === undefined || n < 0 || n > 0xffff) {
      diag(diagnostics, node, `jp expects imm16`);
      return undefined;
    }
    return Uint8Array.of(0xc3, n & 0xff, (n >> 8) & 0xff);
  }
  if (head === 'jp' && ops.length === 2) {
    const cc = conditionName(ops[0]!);
    const opcode = cc ? jpConditionOpcode(cc) : undefined;
    const n = immValue(ops[1]!, env);
    if (opcode === undefined || n === undefined || n < 0 || n > 0xffff) {
      diag(diagnostics, node, `jp cc, nn expects condition + imm16`);
      return undefined;
    }
    return Uint8Array.of(opcode, n & 0xff, (n >> 8) & 0xff);
  }
  if (head === 'jp') {
    diag(diagnostics, node, `jp expects one operand (nn/(hl)/(ix)/(iy)) or two operands (cc, nn)`);
    return undefined;
  }

  if (head === 'jr' && ops.length === 1) {
    const n = immValue(ops[0]!, env);
    if (n === undefined || n < -128 || n > 127) {
      diag(diagnostics, node, `jr expects disp8`);
      return undefined;
    }
    return Uint8Array.of(0x18, n & 0xff);
  }
  if (head === 'jr' && ops.length === 2) {
    const cc = conditionName(ops[0]!);
    const opcode = cc ? jrConditionOpcode(cc) : undefined;
    const n = immValue(ops[1]!, env);
    if (opcode === undefined || n === undefined || n < -128 || n > 127) {
      diag(diagnostics, node, `jr cc, disp expects NZ/Z/NC/C + disp8`);
      return undefined;
    }
    return Uint8Array.of(opcode, n & 0xff);
  }
  if (head === 'jr') {
    diag(diagnostics, node, `jr expects one operand (disp8) or two operands (cc, disp8)`);
    return undefined;
  }

  if (head === 'ld' && ops.length === 2) {
    const r = regName(ops[0]!);
    const n = immValue(ops[1]!, env);
    if (n !== undefined && r) {
      const indexedDst = indexedReg8(ops[0]!);
      if (indexedDst) {
        if (n < 0 || n > 0xff) {
          diag(diagnostics, node, `ld ${indexedDst.display}, n expects imm8`);
          return undefined;
        }
        return Uint8Array.of(indexedDst.prefix, 0x06 + (indexedDst.code << 3), n & 0xff);
      }
      // ld r8, n
      const r8 = reg8Code(r);
      if (r8 !== undefined) {
        if (n < 0 || n > 0xff) {
          diag(diagnostics, node, `ld ${r}, n expects imm8`);
          return undefined;
        }
        return Uint8Array.of(0x06 + (r8 << 3), n & 0xff);
      }

      // ld rr, nn
      if (r === 'BC' || r === 'DE' || r === 'HL' || r === 'SP') {
        if (n < 0 || n > 0xffff) {
          diag(diagnostics, node, `ld ${r}, nn expects imm16`);
          return undefined;
        }
        const op = r === 'BC' ? 0x01 : r === 'DE' ? 0x11 : r === 'HL' ? 0x21 : 0x31;
        return Uint8Array.of(op, n & 0xff, (n >> 8) & 0xff);
      }
      if (r === 'IX' || r === 'IY') {
        if (n < 0 || n > 0xffff) {
          diag(diagnostics, node, `ld ${r}, nn expects imm16`);
          return undefined;
        }
        const prefix = r === 'IX' ? 0xdd : 0xfd;
        return Uint8Array.of(prefix, 0x21, n & 0xff, (n >> 8) & 0xff);
      }
    }

    // ld r8, r8
    const dst = regName(ops[0]!);
    const src = regName(ops[1]!);
    const indexedDst = indexedReg8(ops[0]!);
    const indexedSrc = indexedReg8(ops[1]!);
    if ((indexedDst || indexedSrc) && ops[0]!.kind !== 'Mem' && ops[1]!.kind !== 'Mem') {
      const prefix = indexedDst?.prefix ?? indexedSrc?.prefix;
      if (
        (indexedDst && indexedDst.prefix !== prefix) ||
        (indexedSrc && indexedSrc.prefix !== prefix)
      ) {
        diag(diagnostics, node, `ld between IX* and IY* byte registers is not supported`);
        return undefined;
      }
      if (
        (indexedDst && !indexedSrc && isLegacyHLReg8(src)) ||
        (indexedSrc && !indexedDst && isLegacyHLReg8(dst))
      ) {
        diag(diagnostics, node, `ld with IX*/IY* does not support legacy H/L counterpart operands`);
        return undefined;
      }
      const d = indexedDst ? indexedDst.code : dst ? reg8Code(dst) : undefined;
      const s = indexedSrc ? indexedSrc.code : src ? reg8Code(src) : undefined;
      if (prefix === undefined || d === undefined || s === undefined) {
        diag(diagnostics, node, `ld with IX*/IY* byte registers expects reg8 operands`);
        return undefined;
      }
      return Uint8Array.of(prefix, 0x40 + (d << 3) + s);
    }

    const srcAbs16 = memAbs16(ops[1]!, env);
    if (srcAbs16 !== undefined) {
      if (srcAbs16 < 0 || srcAbs16 > 0xffff) {
        diag(diagnostics, node, `ld rr, (nn) expects abs16 address`);
        return undefined;
      }
      if (dst === 'A') return Uint8Array.of(0x3a, srcAbs16 & 0xff, (srcAbs16 >> 8) & 0xff);
      if (dst === 'HL') return Uint8Array.of(0x2a, srcAbs16 & 0xff, (srcAbs16 >> 8) & 0xff);
      if (dst === 'BC') return Uint8Array.of(0xed, 0x4b, srcAbs16 & 0xff, (srcAbs16 >> 8) & 0xff);
      if (dst === 'DE') return Uint8Array.of(0xed, 0x5b, srcAbs16 & 0xff, (srcAbs16 >> 8) & 0xff);
      if (dst === 'SP') return Uint8Array.of(0xed, 0x7b, srcAbs16 & 0xff, (srcAbs16 >> 8) & 0xff);
      if (dst === 'IX') return Uint8Array.of(0xdd, 0x2a, srcAbs16 & 0xff, (srcAbs16 >> 8) & 0xff);
      if (dst === 'IY') return Uint8Array.of(0xfd, 0x2a, srcAbs16 & 0xff, (srcAbs16 >> 8) & 0xff);
    }

    const dstAbs16 = memAbs16(ops[0]!, env);
    if (dstAbs16 !== undefined) {
      if (dstAbs16 < 0 || dstAbs16 > 0xffff) {
        diag(diagnostics, node, `ld (nn), rr expects abs16 address`);
        return undefined;
      }
      if (src === 'A') return Uint8Array.of(0x32, dstAbs16 & 0xff, (dstAbs16 >> 8) & 0xff);
      if (src === 'HL') return Uint8Array.of(0x22, dstAbs16 & 0xff, (dstAbs16 >> 8) & 0xff);
      if (src === 'BC') return Uint8Array.of(0xed, 0x43, dstAbs16 & 0xff, (dstAbs16 >> 8) & 0xff);
      if (src === 'DE') return Uint8Array.of(0xed, 0x53, dstAbs16 & 0xff, (dstAbs16 >> 8) & 0xff);
      if (src === 'SP') return Uint8Array.of(0xed, 0x73, dstAbs16 & 0xff, (dstAbs16 >> 8) & 0xff);
      if (src === 'IX') return Uint8Array.of(0xdd, 0x22, dstAbs16 & 0xff, (dstAbs16 >> 8) & 0xff);
      if (src === 'IY') return Uint8Array.of(0xfd, 0x22, dstAbs16 & 0xff, (dstAbs16 >> 8) & 0xff);
    }

    if (dst && src) {
      const d = reg8Code(dst);
      const s = reg8Code(src);
      if (d !== undefined && s !== undefined) {
        return Uint8Array.of(0x40 + (d << 3) + s);
      }
    }

    // ld r8, (hl)
    const indexedDstMem = indexedReg8(ops[0]!);
    if (indexedDstMem && ops[1]!.kind === 'Mem') {
      const idx = memIndexed(ops[1]!, env);
      if (!idx) {
        diag(
          diagnostics,
          node,
          `ld ${indexedDstMem.display}, source expects (${indexedDstMem.display.startsWith('IX') ? 'ix' : 'iy'}+disp)`,
        );
        return undefined;
      }
      if (idx.prefix !== indexedDstMem.prefix) {
        diag(
          diagnostics,
          node,
          `ld ${indexedDstMem.display}, source index base must match destination family`,
        );
        return undefined;
      }
      const disp = idx.disp;
      if (disp < -128 || disp > 127) {
        diag(
          diagnostics,
          node,
          `ld ${indexedDstMem.display}, (${indexedDstMem.display.startsWith('IX') ? 'ix' : 'iy'}+disp) expects disp8`,
        );
        return undefined;
      }
      return Uint8Array.of(indexedDstMem.prefix, 0x46 + (indexedDstMem.code << 3), disp & 0xff);
    }
    if (dst) {
      const d = reg8Code(dst);
      if (d !== undefined && ops[1]!.kind === 'Mem') {
        const mem = ops[1]!;
        if (mem.expr.kind === 'EaName' && mem.expr.name.toUpperCase() === 'HL') {
          return Uint8Array.of(0x46 + (d << 3));
        }
        const idx = memIndexed(mem, env);
        if (idx) {
          const disp = idx.disp;
          if (disp < -128 || disp > 127) {
            diag(diagnostics, node, `ld ${dst}, (ix/iy+disp) expects disp8`);
            return undefined;
          }
          return Uint8Array.of(idx.prefix, 0x46 + (d << 3), disp & 0xff);
        }
        if (dst.toUpperCase() === 'A' && mem.expr.kind === 'EaName') {
          const ea = mem.expr.name.toUpperCase();
          if (ea === 'BC') return Uint8Array.of(0x0a); // ld a,(bc)
          if (ea === 'DE') return Uint8Array.of(0x1a); // ld a,(de)
        }
      }
    }

    // ld (hl), r8
    if (ops[0]!.kind === 'Mem') {
      const mem = ops[0]!;
      const indexedSrcMem = indexedReg8(ops[1]!);
      if (indexedSrcMem) {
        const idx = memIndexed(mem, env);
        if (!idx) {
          diag(
            diagnostics,
            node,
            `ld destination expects (${indexedSrcMem.display.startsWith('IX') ? 'ix' : 'iy'}+disp) for source ${indexedSrcMem.display}`,
          );
          return undefined;
        }
        if (idx.prefix !== indexedSrcMem.prefix) {
          diag(
            diagnostics,
            node,
            `ld destination index base must match source ${indexedSrcMem.display} family`,
          );
          return undefined;
        }
        const disp = idx.disp;
        if (disp < -128 || disp > 127) {
          diag(
            diagnostics,
            node,
            `ld (${indexedSrcMem.display.startsWith('IX') ? 'ix' : 'iy'}+disp), ${indexedSrcMem.display} expects disp8`,
          );
          return undefined;
        }
        return Uint8Array.of(idx.prefix, 0x70 + indexedSrcMem.code, disp & 0xff);
      }
      if (mem.expr.kind === 'EaName' && mem.expr.name.toUpperCase() === 'HL' && src) {
        const s = reg8Code(src);
        if (s !== undefined) {
          return Uint8Array.of(0x70 + s);
        }
      }
      const idx = src ? memIndexed(mem, env) : undefined;
      if (idx && src) {
        const s = reg8Code(src);
        if (s !== undefined) {
          const disp = idx.disp;
          if (disp < -128 || disp > 127) {
            diag(diagnostics, node, `ld (ix/iy+disp), ${src} expects disp8`);
            return undefined;
          }
          return Uint8Array.of(idx.prefix, 0x70 + s, disp & 0xff);
        }
      }
      if (mem.expr.kind === 'EaName' && src?.toUpperCase() === 'A') {
        const ea = mem.expr.name.toUpperCase();
        if (ea === 'BC') return Uint8Array.of(0x02); // ld (bc),a
        if (ea === 'DE') return Uint8Array.of(0x12); // ld (de),a
      }
    }

    // ld (hl), n
    if (isMemHL(ops[0]!) && n !== undefined) {
      if (n < 0 || n > 0xff) {
        diag(diagnostics, node, `ld (hl), n expects imm8`);
        return undefined;
      }
      return Uint8Array.of(0x36, n & 0xff);
    }
    // ld (ix/iy+disp), n
    if (n !== undefined) {
      const idx = memIndexed(ops[0]!, env);
      if (idx) {
        if (n < 0 || n > 0xff) {
          diag(diagnostics, node, `ld (ix/iy+disp), n expects imm8`);
          return undefined;
        }
        const disp = idx.disp;
        if (disp < -128 || disp > 127) {
          diag(diagnostics, node, `ld (ix/iy+disp), n expects disp8`);
          return undefined;
        }
        return Uint8Array.of(idx.prefix, 0x36, disp & 0xff, n & 0xff);
      }
    }
    // ld sp, hl/ix/iy
    if (r === 'SP' && src) {
      if (src === 'HL') return Uint8Array.of(0xf9);
      if (src === 'IX') return Uint8Array.of(0xdd, 0xf9);
      if (src === 'IY') return Uint8Array.of(0xfd, 0xf9);
    }

    if (ops[0]!.kind === 'Mem' && ops[1]!.kind === 'Mem') {
      diag(diagnostics, node, `ld does not support memory-to-memory transfers`);
      return undefined;
    }

    if (
      dst !== undefined &&
      dst !== 'A' &&
      (isMemRegName(ops[1]!, 'BC') || isMemRegName(ops[1]!, 'DE'))
    ) {
      diag(diagnostics, node, `ld r8, (bc/de) supports destination A only`);
      return undefined;
    }

    if (
      src !== undefined &&
      src !== 'A' &&
      (isMemRegName(ops[0]!, 'BC') || isMemRegName(ops[0]!, 'DE'))
    ) {
      diag(diagnostics, node, `ld (bc/de), r8 supports source A only`);
      return undefined;
    }

    if (dst === 'AF' || src === 'AF') {
      diag(diagnostics, node, `ld does not support AF in this form`);
      return undefined;
    }

    if (isReg16TransferName(dst) && isReg16TransferName(src)) {
      if (dst === 'SP') {
        diag(diagnostics, node, `ld SP, rr supports HL/IX/IY only`);
        return undefined;
      }
      diag(diagnostics, node, `ld rr, rr supports SP <- HL/IX/IY only`);
      return undefined;
    }

    diag(diagnostics, node, `ld expects a supported register/memory/immediate transfer form`);
    return undefined;
  }

  if (head === 'inc' && ops.length === 1) {
    const indexed = indexedReg8(ops[0]!);
    if (indexed) return Uint8Array.of(indexed.prefix, 0x04 + (indexed.code << 3));
    const r = regName(ops[0]!);
    if (r) {
      const r8 = reg8Code(r);
      if (r8 !== undefined) {
        // inc r8
        return Uint8Array.of(0x04 + (r8 << 3));
      }
      // inc rr
      switch (r) {
        case 'BC':
          return Uint8Array.of(0x03);
        case 'DE':
          return Uint8Array.of(0x13);
        case 'HL':
          return Uint8Array.of(0x23);
        case 'SP':
          return Uint8Array.of(0x33);
        case 'IX':
          return Uint8Array.of(0xdd, 0x23);
        case 'IY':
          return Uint8Array.of(0xfd, 0x23);
      }
    }
    // inc (hl)
    if (isMemHL(ops[0]!)) return Uint8Array.of(0x34);
    // inc (ix/iy+disp)
    const idx = memIndexed(ops[0]!, env);
    if (idx) {
      const disp = idx.disp;
      if (disp < -128 || disp > 127) {
        diag(diagnostics, node, `inc (ix/iy+disp) expects disp8`);
        return undefined;
      }
      return Uint8Array.of(idx.prefix, 0x34, disp & 0xff);
    }
    diag(diagnostics, node, `inc expects r8/rr/(hl) operand`);
    return undefined;
  }

  if (head === 'dec' && ops.length === 1) {
    const indexed = indexedReg8(ops[0]!);
    if (indexed) return Uint8Array.of(indexed.prefix, 0x05 + (indexed.code << 3));
    const r = regName(ops[0]!);
    if (r) {
      const r8 = reg8Code(r);
      if (r8 !== undefined) {
        // dec r8
        return Uint8Array.of(0x05 + (r8 << 3));
      }
      // dec rr
      switch (r) {
        case 'BC':
          return Uint8Array.of(0x0b);
        case 'DE':
          return Uint8Array.of(0x1b);
        case 'HL':
          return Uint8Array.of(0x2b);
        case 'SP':
          return Uint8Array.of(0x3b);
        case 'IX':
          return Uint8Array.of(0xdd, 0x2b);
        case 'IY':
          return Uint8Array.of(0xfd, 0x2b);
      }
    }
    // dec (hl)
    if (isMemHL(ops[0]!)) return Uint8Array.of(0x35);
    // dec (ix/iy+disp)
    const idx = memIndexed(ops[0]!, env);
    if (idx) {
      const disp = idx.disp;
      if (disp < -128 || disp > 127) {
        diag(diagnostics, node, `dec (ix/iy+disp) expects disp8`);
        return undefined;
      }
      return Uint8Array.of(idx.prefix, 0x35, disp & 0xff);
    }
    diag(diagnostics, node, `dec expects r8/rr/(hl) operand`);
    return undefined;
  }

  if (head === 'push' && ops.length === 1) {
    const r16 = regName(ops[0]!);
    if (!r16) {
      diag(diagnostics, node, `push expects reg16`);
      return undefined;
    }
    switch (r16) {
      case 'BC':
        return Uint8Array.of(0xc5);
      case 'DE':
        return Uint8Array.of(0xd5);
      case 'HL':
        return Uint8Array.of(0xe5);
      case 'AF':
        return Uint8Array.of(0xf5);
      case 'IX':
        return Uint8Array.of(0xdd, 0xe5);
      case 'IY':
        return Uint8Array.of(0xfd, 0xe5);
      default:
        diag(diagnostics, node, `push supports BC/DE/HL/AF/IX/IY only`);
        return undefined;
    }
  }

  if (head === 'pop' && ops.length === 1) {
    const r16 = regName(ops[0]!);
    if (!r16) {
      diag(diagnostics, node, `pop expects reg16`);
      return undefined;
    }
    switch (r16) {
      case 'BC':
        return Uint8Array.of(0xc1);
      case 'DE':
        return Uint8Array.of(0xd1);
      case 'HL':
        return Uint8Array.of(0xe1);
      case 'AF':
        return Uint8Array.of(0xf1);
      case 'IX':
        return Uint8Array.of(0xdd, 0xe1);
      case 'IY':
        return Uint8Array.of(0xfd, 0xe1);
      default:
        diag(diagnostics, node, `pop supports BC/DE/HL/AF/IX/IY only`);
        return undefined;
    }
  }

  if (head === 'ex' && ops.length === 2) {
    const a = regName(ops[0]!);
    const b = regName(ops[1]!);
    if ((a === "AF'" && b === 'AF') || (a === 'AF' && b === "AF'")) return Uint8Array.of(0x08); // ex af,af'
    if ((a === 'DE' && b === 'HL') || (a === 'HL' && b === 'DE')) return Uint8Array.of(0xeb); // ex de,hl
    if (
      (ops[0]!.kind === 'Mem' &&
        ops[0]!.expr.kind === 'EaName' &&
        ops[0]!.expr.name.toUpperCase() === 'SP' &&
        b === 'HL') ||
      (ops[1]!.kind === 'Mem' &&
        ops[1]!.expr.kind === 'EaName' &&
        ops[1]!.expr.name.toUpperCase() === 'SP' &&
        a === 'HL')
    ) {
      return Uint8Array.of(0xe3); // ex (sp),hl
    }
    if (
      (ops[0]!.kind === 'Mem' &&
        ops[0]!.expr.kind === 'EaName' &&
        ops[0]!.expr.name.toUpperCase() === 'SP' &&
        b === 'IX') ||
      (ops[1]!.kind === 'Mem' &&
        ops[1]!.expr.kind === 'EaName' &&
        ops[1]!.expr.name.toUpperCase() === 'SP' &&
        a === 'IX')
    ) {
      return Uint8Array.of(0xdd, 0xe3); // ex (sp),ix
    }
    if (
      (ops[0]!.kind === 'Mem' &&
        ops[0]!.expr.kind === 'EaName' &&
        ops[0]!.expr.name.toUpperCase() === 'SP' &&
        b === 'IY') ||
      (ops[1]!.kind === 'Mem' &&
        ops[1]!.expr.kind === 'EaName' &&
        ops[1]!.expr.name.toUpperCase() === 'SP' &&
        a === 'IY')
    ) {
      return Uint8Array.of(0xfd, 0xe3); // ex (sp),iy
    }
    diag(
      diagnostics,
      node,
      `ex supports "AF, AF'", "DE, HL", "(SP), HL", "(SP), IX", and "(SP), IY" only`,
    );
    return undefined;
  }

  const encodeAluAOrImm8OrMemHL = (
    rBase: number,
    immOpcode: number,
    memOpcode: number,
    mnemonic: string,
    allowExplicitA = false,
  ): Uint8Array | undefined => {
    let src: AsmOperandNode | undefined;
    if (ops.length === 1) src = ops[0]!;
    else if (ops.length === 2) {
      if (allowExplicitA) {
        if (regName(ops[0]!) === 'A') src = ops[1]!;
        else {
          diag(diagnostics, node, `${mnemonic} two-operand form requires destination A`);
          return undefined;
        }
      }
    }
    if (!src) return undefined;

    const reg = regName(src);
    const indexed = indexedReg8(src);
    if (indexed) return Uint8Array.of(indexed.prefix, rBase + indexed.code);
    if (reg) {
      const code = reg8Code(reg);
      if (code === undefined) {
        diag(diagnostics, node, `${mnemonic} expects reg8/imm8/(hl)`);
        return undefined;
      }
      return Uint8Array.of(rBase + code);
    }

    if (isMemHL(src)) return Uint8Array.of(memOpcode);
    const idx = memIndexed(src, env);
    if (idx) {
      const disp = idx.disp;
      if (disp < -128 || disp > 127) {
        diag(diagnostics, node, `${mnemonic} (ix/iy+disp) expects disp8`);
        return undefined;
      }
      return Uint8Array.of(idx.prefix, memOpcode, disp & 0xff);
    }

    const n = immValue(src, env);
    if (n === undefined || n < 0 || n > 0xff) {
      diag(diagnostics, node, `${mnemonic} expects imm8`);
      return undefined;
    }
    return Uint8Array.of(immOpcode, n & 0xff);
  };

  if (head === 'sub') {
    const encoded = encodeAluAOrImm8OrMemHL(0x90, 0xd6, 0x96, 'sub', true);
    if (encoded) return encoded;
    if (ops.length === 1 || ops.length === 2) return undefined;
  }

  if (head === 'cp') {
    const encoded = encodeAluAOrImm8OrMemHL(0xb8, 0xfe, 0xbe, 'cp', true);
    if (encoded) return encoded;
    if (ops.length === 1 || ops.length === 2) return undefined;
  }

  if (head === 'and') {
    const encoded = encodeAluAOrImm8OrMemHL(0xa0, 0xe6, 0xa6, 'and', true);
    if (encoded) return encoded;
    if (ops.length === 1 || ops.length === 2) return undefined;
  }

  if (head === 'or') {
    const encoded = encodeAluAOrImm8OrMemHL(0xb0, 0xf6, 0xb6, 'or', true);
    if (encoded) return encoded;
    if (ops.length === 1 || ops.length === 2) return undefined;
  }

  if (head === 'xor') {
    const encoded = encodeAluAOrImm8OrMemHL(0xa8, 0xee, 0xae, 'xor', true);
    if (encoded) return encoded;
    if (ops.length === 1 || ops.length === 2) return undefined;
  }

  if (head === 'adc') {
    if (ops.length === 2) {
      const dst = regName(ops[0]!);
      if (dst === 'HL') {
        const src = regName(ops[1]!);
        switch (src) {
          case 'BC':
            return Uint8Array.of(0xed, 0x4a);
          case 'DE':
            return Uint8Array.of(0xed, 0x5a);
          case 'HL':
            return Uint8Array.of(0xed, 0x6a);
          case 'SP':
            return Uint8Array.of(0xed, 0x7a);
          default:
            diag(diagnostics, node, `adc HL, rr expects BC/DE/HL/SP`);
            return undefined;
        }
      }
      if (dst !== 'A') {
        diag(diagnostics, node, `adc expects destination A or HL`);
        return undefined;
      }
    }
    const encoded = encodeAluAOrImm8OrMemHL(0x88, 0xce, 0x8e, 'adc', true);
    if (encoded) return encoded;
    if (ops.length === 1 || ops.length === 2) return undefined;
  }

  if (head === 'sbc') {
    if (ops.length === 2) {
      const dst = regName(ops[0]!);
      if (dst === 'HL') {
        const src = regName(ops[1]!);
        switch (src) {
          case 'BC':
            return Uint8Array.of(0xed, 0x42);
          case 'DE':
            return Uint8Array.of(0xed, 0x52);
          case 'HL':
            return Uint8Array.of(0xed, 0x62);
          case 'SP':
            return Uint8Array.of(0xed, 0x72);
          default:
            diag(diagnostics, node, `sbc HL, rr expects BC/DE/HL/SP`);
            return undefined;
        }
      }
      if (dst !== 'A') {
        diag(diagnostics, node, `sbc expects destination A or HL`);
        return undefined;
      }
    }
    const encoded = encodeAluAOrImm8OrMemHL(0x98, 0xde, 0x9e, 'sbc', true);
    if (encoded) return encoded;
    if (ops.length === 1 || ops.length === 2) return undefined;
  }

  const encodeBitLike = (
    base: number,
    mnemonic: string,
    allowIndexedDestination = false,
  ): Uint8Array | undefined => {
    if (ops.length !== 2 && !(allowIndexedDestination && ops.length === 3)) return undefined;
    const bit = immValue(ops[0]!, env);
    if (bit === undefined || bit < 0 || bit > 7) {
      diag(diagnostics, node, `${mnemonic} expects bit index 0..7`);
      return undefined;
    }
    const src = ops[1]!;
    const idx = memIndexed(src, env);
    if (idx) {
      const disp = idx.disp;
      if (disp < -128 || disp > 127) {
        diag(diagnostics, node, `${mnemonic} (ix/iy+disp) expects disp8`);
        return undefined;
      }
      if (ops.length === 3) {
        const dstIndexed = indexedReg8(ops[2]!);
        if (dstIndexed) {
          if (dstIndexed.prefix !== idx.prefix) {
            diag(
              diagnostics,
              node,
              `${mnemonic} indexed destination family must match source index base`,
            );
          } else {
            diag(
              diagnostics,
              node,
              `${mnemonic} indexed destination must use legacy reg8 B/C/D/E/H/L/A`,
            );
          }
          return undefined;
        }
        const dstReg = regName(ops[2]!);
        const dstCode = dstReg ? reg8Code(dstReg) : undefined;
        if (dstCode === undefined) {
          diag(diagnostics, node, `${mnemonic} b,(ix/iy+disp),r expects reg8 destination`);
          return undefined;
        }
        return Uint8Array.of(idx.prefix, 0xcb, disp & 0xff, base + (bit << 3) + dstCode);
      }
      // DD/FD CB disp <op> (where <op> matches the (HL) encoding)
      return Uint8Array.of(idx.prefix, 0xcb, disp & 0xff, base + (bit << 3) + 0x06);
    }
    if (ops.length === 3) {
      diag(diagnostics, node, `${mnemonic} b,(ix/iy+disp),r requires an indexed memory source`);
      return undefined;
    }
    if (isMemHL(src)) {
      return Uint8Array.of(0xcb, base + (bit << 3) + 0x06);
    }
    const reg = regName(src);
    const code = reg ? reg8Code(reg) : undefined;
    if (code === undefined) {
      diag(diagnostics, node, `${mnemonic} expects reg8 or (hl)`);
      return undefined;
    }
    return Uint8Array.of(0xcb, base + (bit << 3) + code);
  };

  if (head === 'bit') {
    const encoded = encodeBitLike(0x40, 'bit');
    if (encoded) return encoded;
    if (ops.length === 2) return undefined;
  }
  if (head === 'res') {
    const encoded = encodeBitLike(0x80, 'res', true);
    if (encoded) return encoded;
    if (ops.length === 2 || ops.length === 3) return undefined;
  }
  if (head === 'set') {
    const encoded = encodeBitLike(0xc0, 'set', true);
    if (encoded) return encoded;
    if (ops.length === 2 || ops.length === 3) return undefined;
  }

  const encodeCbRotateShift = (base: number, mnemonic: string): Uint8Array | undefined => {
    if (ops.length !== 1 && ops.length !== 2) return undefined;
    const operand = ops[0]!;
    const idx = memIndexed(operand, env);
    if (idx) {
      const disp = idx.disp;
      if (disp < -128 || disp > 127) {
        diag(diagnostics, node, `${mnemonic} (ix/iy+disp) expects disp8`);
        return undefined;
      }
      if (ops.length === 1) {
        // DD/FD CB disp <op> (where <op> matches the (HL) encoding)
        return Uint8Array.of(idx.prefix, 0xcb, disp & 0xff, base + 0x06);
      }
      const dstIndexed = indexedReg8(ops[1]!);
      if (dstIndexed) {
        if (dstIndexed.prefix !== idx.prefix) {
          diag(
            diagnostics,
            node,
            `${mnemonic} indexed destination family must match source index base`,
          );
        } else {
          diag(
            diagnostics,
            node,
            `${mnemonic} indexed destination must use legacy reg8 B/C/D/E/H/L/A`,
          );
        }
        return undefined;
      }
      const dstReg = regName(ops[1]!);
      const dstCode = dstReg ? reg8Code(dstReg) : undefined;
      if (dstCode === undefined) {
        diag(diagnostics, node, `${mnemonic} (ix/iy+disp),r expects reg8 destination`);
        return undefined;
      }
      // DD/FD CB disp <op+r>
      return Uint8Array.of(idx.prefix, 0xcb, disp & 0xff, base + dstCode);
    }
    if (ops.length === 2) {
      diag(diagnostics, node, `${mnemonic} two-operand form requires (ix/iy+disp) source`);
      return undefined;
    }
    if (isMemHL(operand)) return Uint8Array.of(0xcb, base + 0x06);
    const reg = regName(operand);
    const code = reg ? reg8Code(reg) : undefined;
    if (code === undefined) {
      diag(diagnostics, node, `${mnemonic} expects reg8 or (hl)`);
      return undefined;
    }
    return Uint8Array.of(0xcb, base + code);
  };

  if (head === 'rl') {
    const encoded = encodeCbRotateShift(0x10, 'rl');
    if (encoded) return encoded;
    if (ops.length === 1 || ops.length === 2) return undefined;
  }
  if (head === 'rr') {
    const encoded = encodeCbRotateShift(0x18, 'rr');
    if (encoded) return encoded;
    if (ops.length === 1 || ops.length === 2) return undefined;
  }
  if (head === 'sla') {
    const encoded = encodeCbRotateShift(0x20, 'sla');
    if (encoded) return encoded;
    if (ops.length === 1 || ops.length === 2) return undefined;
  }
  if (head === 'sra') {
    const encoded = encodeCbRotateShift(0x28, 'sra');
    if (encoded) return encoded;
    if (ops.length === 1 || ops.length === 2) return undefined;
  }
  if (head === 'srl') {
    const encoded = encodeCbRotateShift(0x38, 'srl');
    if (encoded) return encoded;
    if (ops.length === 1 || ops.length === 2) return undefined;
  }
  if (head === 'sll') {
    const encoded = encodeCbRotateShift(0x30, 'sll');
    if (encoded) return encoded;
    if (ops.length === 1 || ops.length === 2) return undefined;
  }
  if (head === 'rlc') {
    const encoded = encodeCbRotateShift(0x00, 'rlc');
    if (encoded) return encoded;
    if (ops.length === 1 || ops.length === 2) return undefined;
  }
  if (head === 'rrc') {
    const encoded = encodeCbRotateShift(0x08, 'rrc');
    if (encoded) return encoded;
    if (ops.length === 1 || ops.length === 2) return undefined;
  }

  if (isKnownInstructionHead(head) && diagnostics.length > diagnosticsBefore) {
    return undefined;
  }

  const arityMessage = arityDiagnostic(head, ops.length);
  if (arityMessage !== undefined) {
    diag(diagnostics, node, arityMessage);
    return undefined;
  }

  if (isKnownInstructionHead(head)) {
    diag(diagnostics, node, `${head} has unsupported operand form`);
    return undefined;
  }

  diag(diagnostics, node, `Unsupported instruction: ${node.head}`);
  return undefined;
}

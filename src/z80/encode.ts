import type { Diagnostic } from '../diagnostics/types.js';
import { DiagnosticIds } from '../diagnostics/types.js';
import type { AsmInstructionNode, AsmOperandNode } from '../frontend/ast.js';
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
  const head = node.head.toLowerCase();
  const ops = node.operands;

  if (head === 'nop' && ops.length === 0) return Uint8Array.of(0x00);
  if (head === 'halt' && ops.length === 0) return Uint8Array.of(0x76);
  if (head === 'di' && ops.length === 0) return Uint8Array.of(0xf3);
  if (head === 'ei' && ops.length === 0) return Uint8Array.of(0xfb);
  if (head === 'scf' && ops.length === 0) return Uint8Array.of(0x37);
  if (head === 'ccf' && ops.length === 0) return Uint8Array.of(0x3f);
  if (head === 'cpl' && ops.length === 0) return Uint8Array.of(0x2f);
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
  if (head === 'rlca' && ops.length === 0) return Uint8Array.of(0x07);
  if (head === 'rrca' && ops.length === 0) return Uint8Array.of(0x0f);
  if (head === 'rla' && ops.length === 0) return Uint8Array.of(0x17);
  if (head === 'rra' && ops.length === 0) return Uint8Array.of(0x1f);

  if (head === 'add' && ops.length === 2) {
    const dst = regName(ops[0]!);
    const src = regName(ops[1]!);

    if (dst === 'A' && src) {
      const s = reg8Code(src);
      if (s === undefined) {
        diag(diagnostics, node, `add A, r expects reg8`);
        return undefined;
      }
      return Uint8Array.of(0x80 + s);
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

  if (head === 'rst' && ops.length === 1) {
    const n = immValue(ops[0]!, env);
    if (n === undefined || n < 0 || n > 0x38 || (n & 0x07) !== 0) {
      diag(diagnostics, node, `rst expects an imm8 multiple of 8 (0..56)`);
      return undefined;
    }
    return Uint8Array.of(0xc7 + n);
  }

  if (head === 'im' && ops.length === 1) {
    const n = immValue(ops[0]!, env);
    if (n === 0) return Uint8Array.of(0xed, 0x46);
    if (n === 1) return Uint8Array.of(0xed, 0x56);
    if (n === 2) return Uint8Array.of(0xed, 0x5e);
    diag(diagnostics, node, `im expects 0, 1, or 2`);
    return undefined;
  }

  if (head === 'reti' && ops.length === 0) return Uint8Array.of(0xed, 0x4d);
  if (head === 'retn' && ops.length === 0) return Uint8Array.of(0xed, 0x45);

  if (head === 'neg' && ops.length === 0) return Uint8Array.of(0xed, 0x44);
  if (head === 'rrd' && ops.length === 0) return Uint8Array.of(0xed, 0x67);
  if (head === 'rld' && ops.length === 0) return Uint8Array.of(0xed, 0x6f);

  if (head === 'ld' && ops.length === 2) {
    const dst = regName(ops[0]!);
    const src = regName(ops[1]!);
    if (dst === 'I' && src === 'A') return Uint8Array.of(0xed, 0x47);
    if (dst === 'A' && src === 'I') return Uint8Array.of(0xed, 0x57);
    if (dst === 'R' && src === 'A') return Uint8Array.of(0xed, 0x4f);
    if (dst === 'A' && src === 'R') return Uint8Array.of(0xed, 0x5f);
  }

  if (head === 'in' && ops.length === 2) {
    const dst = regName(ops[0]!);
    const dst8 = dst ? reg8Code(dst) : undefined;

    if (dst8 === undefined) {
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

  if (head === 'out' && ops.length === 2) {
    const port = ops[0]!;
    const src = regName(ops[1]!);
    const src8 = src ? reg8Code(src) : undefined;

    if (src8 === undefined) {
      diag(diagnostics, node, `out expects a reg8 source`);
      return undefined;
    }

    if (port.kind === 'PortC') {
      // out (c),r => ED 41 + r*8
      return Uint8Array.of(0xed, 0x41 + (src8 << 3));
    }
    if (port.kind === 'PortImm8') {
      // out (n),a => D3 n
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

  if (head === 'jp' && ops.length === 1) {
    // jp (hl) / jp (ix) / jp (iy)
    if (isMemRegName(ops[0]!, 'HL')) return Uint8Array.of(0xe9);
    if (isMemRegName(ops[0]!, 'IX')) return Uint8Array.of(0xdd, 0xe9);
    if (isMemRegName(ops[0]!, 'IY')) return Uint8Array.of(0xfd, 0xe9);

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

  if (head === 'ld' && ops.length === 2) {
    const r = regName(ops[0]!);
    const n = immValue(ops[1]!, env);
    if (n !== undefined && r) {
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
    }

    // ld r8, r8
    const dst = regName(ops[0]!);
    const src = regName(ops[1]!);
    if (dst && src) {
      const d = reg8Code(dst);
      const s = reg8Code(src);
      if (d !== undefined && s !== undefined) {
        return Uint8Array.of(0x40 + (d << 3) + s);
      }
    }

    // ld r8, (hl)
    if (dst) {
      const d = reg8Code(dst);
      if (d !== undefined && ops[1]!.kind === 'Mem') {
        const mem = ops[1]!;
        if (mem.expr.kind === 'EaName' && mem.expr.name.toUpperCase() === 'HL') {
          return Uint8Array.of(0x46 + (d << 3));
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
      if (mem.expr.kind === 'EaName' && mem.expr.name.toUpperCase() === 'HL' && src) {
        const s = reg8Code(src);
        if (s !== undefined) {
          return Uint8Array.of(0x70 + s);
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

    // ld sp, hl
    if (r === 'SP' && src === 'HL') {
      return Uint8Array.of(0xf9);
    }
  }

  if (head === 'inc' && ops.length === 1) {
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
      }
    }
    // inc (hl)
    if (isMemHL(ops[0]!)) return Uint8Array.of(0x34);
    diag(diagnostics, node, `inc expects r8/rr/(hl) operand`);
    return undefined;
  }

  if (head === 'dec' && ops.length === 1) {
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
      }
    }
    // dec (hl)
    if (isMemHL(ops[0]!)) return Uint8Array.of(0x35);
    diag(diagnostics, node, `dec expects r8/rr/(hl) operand`);
    return undefined;
  }

  if (head === 'push' && ops.length === 1) {
    const r16 = reg16Name(ops[0]!);
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
      default:
        diag(diagnostics, node, `push supports BC/DE/HL/AF only`);
        return undefined;
    }
  }

  if (head === 'pop' && ops.length === 1) {
    const r16 = reg16Name(ops[0]!);
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
      default:
        diag(diagnostics, node, `pop supports BC/DE/HL/AF only`);
        return undefined;
    }
  }

  if (head === 'ex' && ops.length === 2) {
    const a = regName(ops[0]!);
    const b = regName(ops[1]!);
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
    diag(diagnostics, node, `ex supports "DE, HL" and "(SP), HL" only`);
    return undefined;
  }

  if (head === 'exx' && ops.length === 0) return Uint8Array.of(0xd9);

  const encodeAluAOrImm8OrMemHL = (
    rBase: number,
    immOpcode: number,
    memOpcode: number,
    mnemonic: string,
    allowExplicitA = false,
  ): Uint8Array | undefined => {
    let src: AsmOperandNode | undefined;
    if (ops.length === 1) src = ops[0]!;
    else if (allowExplicitA && ops.length === 2 && regName(ops[0]!) === 'A') src = ops[1]!;
    if (!src) return undefined;

    const reg = regName(src);
    if (reg) {
      const code = reg8Code(reg);
      if (code === undefined) {
        diag(diagnostics, node, `${mnemonic} expects reg8/imm8/(hl)`);
        return undefined;
      }
      return Uint8Array.of(rBase + code);
    }

    if (isMemHL(src)) return Uint8Array.of(memOpcode);

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
  }

  if (head === 'cp') {
    const encoded = encodeAluAOrImm8OrMemHL(0xb8, 0xfe, 0xbe, 'cp', true);
    if (encoded) return encoded;
  }

  if (head === 'and') {
    const encoded = encodeAluAOrImm8OrMemHL(0xa0, 0xe6, 0xa6, 'and');
    if (encoded) return encoded;
  }

  if (head === 'or') {
    const encoded = encodeAluAOrImm8OrMemHL(0xb0, 0xf6, 0xb6, 'or');
    if (encoded) return encoded;
  }

  if (head === 'xor') {
    const encoded = encodeAluAOrImm8OrMemHL(0xa8, 0xee, 0xae, 'xor');
    if (encoded) return encoded;
  }

  if (head === 'adc') {
    const encoded = encodeAluAOrImm8OrMemHL(0x88, 0xce, 0x8e, 'adc', true);
    if (encoded) return encoded;
  }

  if (head === 'sbc') {
    const encoded = encodeAluAOrImm8OrMemHL(0x98, 0xde, 0x9e, 'sbc', true);
    if (encoded) return encoded;
  }

  const encodeBitLike = (base: number, mnemonic: string): Uint8Array | undefined => {
    if (ops.length !== 2) return undefined;
    const bit = immValue(ops[0]!, env);
    if (bit === undefined || bit < 0 || bit > 7) {
      diag(diagnostics, node, `${mnemonic} expects bit index 0..7`);
      return undefined;
    }
    const src = ops[1]!;
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
  }
  if (head === 'res') {
    const encoded = encodeBitLike(0x80, 'res');
    if (encoded) return encoded;
  }
  if (head === 'set') {
    const encoded = encodeBitLike(0xc0, 'set');
    if (encoded) return encoded;
  }

  const encodeCbRotateShift = (base: number, mnemonic: string): Uint8Array | undefined => {
    if (ops.length !== 1) return undefined;
    const operand = ops[0]!;
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
  }
  if (head === 'rr') {
    const encoded = encodeCbRotateShift(0x18, 'rr');
    if (encoded) return encoded;
  }
  if (head === 'sla') {
    const encoded = encodeCbRotateShift(0x20, 'sla');
    if (encoded) return encoded;
  }
  if (head === 'sra') {
    const encoded = encodeCbRotateShift(0x28, 'sra');
    if (encoded) return encoded;
  }
  if (head === 'srl') {
    const encoded = encodeCbRotateShift(0x38, 'srl');
    if (encoded) return encoded;
  }
  if (head === 'rlc') {
    const encoded = encodeCbRotateShift(0x00, 'rlc');
    if (encoded) return encoded;
  }
  if (head === 'rrc') {
    const encoded = encodeCbRotateShift(0x08, 'rrc');
    if (encoded) return encoded;
  }

  diag(diagnostics, node, `Unsupported instruction: ${node.head}`);
  return undefined;
}

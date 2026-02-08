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
  if (head === 'ret' && ops.length === 0) return Uint8Array.of(0xc9);

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

  if (head === 'jp' && ops.length === 1) {
    const n = immValue(ops[0]!, env);
    if (n === undefined || n < 0 || n > 0xffff) {
      diag(diagnostics, node, `jp expects imm16`);
      return undefined;
    }
    return Uint8Array.of(0xc3, n & 0xff, (n >> 8) & 0xff);
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
    }

    // ld sp, hl
    if (r === 'SP' && src === 'HL') {
      return Uint8Array.of(0xf9);
    }
  }

  if (head === 'inc' && ops.length === 1) {
    const r = regName(ops[0]!);
    if (!r) {
      diag(diagnostics, node, `inc expects register operand`);
      return undefined;
    }
    switch (r) {
      case 'BC':
        return Uint8Array.of(0x03);
      case 'DE':
        return Uint8Array.of(0x13);
      case 'HL':
        return Uint8Array.of(0x23);
      case 'SP':
        return Uint8Array.of(0x33);
      default:
        diag(diagnostics, node, `inc supports BC/DE/HL/SP in current subset`);
        return undefined;
    }
  }

  if (head === 'dec' && ops.length === 1) {
    const r = regName(ops[0]!);
    if (!r) {
      diag(diagnostics, node, `dec expects register operand`);
      return undefined;
    }
    switch (r) {
      case 'BC':
        return Uint8Array.of(0x0b);
      case 'DE':
        return Uint8Array.of(0x1b);
      case 'HL':
        return Uint8Array.of(0x2b);
      case 'SP':
        return Uint8Array.of(0x3b);
      default:
        diag(diagnostics, node, `dec supports BC/DE/HL/SP in current subset`);
        return undefined;
    }
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

  diag(diagnostics, node, `Unsupported instruction in PR1 subset: ${node.head}`);
  return undefined;
}

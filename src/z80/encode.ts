import type { Diagnostic } from '../diagnostics/types.js';
import { DiagnosticIds } from '../diagnostics/types.js';
import type { AsmInstructionNode, AsmOperandNode } from '../frontend/ast.js';

function diag(
  diagnostics: Diagnostic[],
  node: { span: { file: string; start: { line: number; column: number } } },
  message: string,
): void {
  diagnostics.push({
    id: DiagnosticIds.Unknown,
    severity: 'error',
    message,
    file: node.span.file,
    line: node.span.start.line,
    column: node.span.start.column,
  });
}

function immValue(op: AsmOperandNode): number | undefined {
  if (op.kind !== 'Imm') return undefined;
  if (op.expr.kind !== 'ImmLiteral') return undefined;
  return op.expr.value;
}

function regName(op: AsmOperandNode): string | undefined {
  return op.kind === 'Reg' ? op.name.toUpperCase() : undefined;
}

/**
 * Encode a single `asm` instruction node into Z80 machine-code bytes.
 *
 * PR1 implementation note:
 * - Supports only a tiny subset: `nop`, `ret`, `jp imm16`, `ld A, imm8`, `ld HL, imm16`.
 * - On unsupported forms, appends an error diagnostic and returns `undefined`.
 */
export function encodeInstruction(
  node: AsmInstructionNode,
  diagnostics: Diagnostic[],
): Uint8Array | undefined {
  const head = node.head.toLowerCase();
  const ops = node.operands;

  if (head === 'nop' && ops.length === 0) return Uint8Array.of(0x00);
  if (head === 'ret' && ops.length === 0) return Uint8Array.of(0xc9);

  if (head === 'jp' && ops.length === 1) {
    const n = immValue(ops[0]!);
    if (n === undefined || n < 0 || n > 0xffff) {
      diag(diagnostics, node, `jp expects imm16 literal`);
      return undefined;
    }
    return Uint8Array.of(0xc3, n & 0xff, (n >> 8) & 0xff);
  }

  if (head === 'ld' && ops.length === 2) {
    const r = regName(ops[0]!);
    const n = immValue(ops[1]!);
    if (r === 'A') {
      if (n === undefined || n < 0 || n > 0xff) {
        diag(diagnostics, node, `ld A, n expects imm8 literal`);
        return undefined;
      }
      return Uint8Array.of(0x3e, n & 0xff);
    }
    if (r === 'HL') {
      if (n === undefined || n < 0 || n > 0xffff) {
        diag(diagnostics, node, `ld HL, nn expects imm16 literal`);
        return undefined;
      }
      return Uint8Array.of(0x21, n & 0xff, (n >> 8) & 0xff);
    }
  }

  diag(diagnostics, node, `Unsupported instruction in PR1 subset: ${node.head}`);
  return undefined;
}

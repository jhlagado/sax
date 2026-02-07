import type { Diagnostic } from '../diagnostics/types.js';
import { DiagnosticIds } from '../diagnostics/types.js';
import type { EmittedByteMap, SymbolEntry } from '../formats/types.js';
import type { ProgramNode } from '../frontend/ast.js';
import { encodeInstruction } from '../z80/encode.js';

function diag(diagnostics: Diagnostic[], file: string, message: string): void {
  diagnostics.push({ id: DiagnosticIds.Unknown, severity: 'error', message, file });
}

/**
 * Emit machine-code bytes for a parsed program into an address->byte map.
 *
 * PR1 implementation note:
 * - Uses a single linear PC starting at 0 (no sections/imports yet).
 * - Collects label symbols and encodes only the PR1 instruction subset.
 * - Appends errors to `diagnostics` and continues best-effort.
 */
export function emitProgram(
  program: ProgramNode,
  diagnostics: Diagnostic[],
): { map: EmittedByteMap; symbols: SymbolEntry[] } {
  const bytes = new Map<number, number>();
  const symbols: SymbolEntry[] = [];

  let pc = 0;
  const module = program.files[0];
  if (!module) {
    diag(diagnostics, program.entryFile, 'No module files to compile.');
    return { map: { bytes }, symbols };
  }

  for (const item of module.items) {
    if (item.kind !== 'FuncDecl') continue;
    for (const asmItem of item.asm.items) {
      if (asmItem.kind === 'AsmLabel') {
        symbols.push({
          kind: 'label',
          name: asmItem.name,
          address: pc,
          file: asmItem.span.file,
          line: asmItem.span.start.line,
          scope: 'global',
        });
        continue;
      }
      if (asmItem.kind !== 'AsmInstruction') continue;

      const encoded = encodeInstruction(asmItem, diagnostics);
      if (!encoded) continue;
      for (const b of encoded) {
        bytes.set(pc, b);
        pc++;
      }
    }
  }

  return { map: { bytes, writtenRange: { start: 0, end: pc } }, symbols };
}

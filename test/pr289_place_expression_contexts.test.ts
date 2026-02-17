import { describe, expect, it } from 'vitest';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { compile } from '../src/compile.js';
import { DiagnosticIds } from '../src/diagnostics/types.js';
import { defaultFormatWriters } from '../src/formats/index.js';
import type { AsmArtifact } from '../src/formats/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR289: place-expression semantics for field/element operands', () => {
  it('applies value/store contexts for scalar place expressions and address contexts for ea params', async () => {
    const entry = join(__dirname, 'fixtures', 'pr289_place_expression_contexts_positive.zax');
    const res = await compile(
      entry,
      {
        emitBin: false,
        emitHex: false,
        emitD8m: false,
        emitListing: false,
        emitAsm: true,
      },
      { formats: defaultFormatWriters },
    );

    expect(res.diagnostics).toEqual([]);
    const asm = res.artifacts.find((a): a is AsmArtifact => a.kind === 'asm');
    expect(asm).toBeDefined();

    // Field place-expression in value/store contexts.
    expect(asm!.text).toContain('ld A, (p)');
    expect(asm!.text).toContain('ld (p), A');

    // Array element place-expression in value/store contexts.
    expect(asm!.text).toContain('ld A, (hl)');
    expect(asm!.text).toContain('ld (hl), A');

    // Explicit (ea) forms remain valid and compile in parallel with implicit place forms.
    expect(asm!.text).toContain('; func main begin');
    expect(asm!.text).toContain('; func main end');
  });

  it('rejects passing dereference forms to ea-typed parameters', async () => {
    const entry = join(__dirname, 'fixtures', 'pr289_place_expression_contexts_negative.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });

    expect(res.artifacts).toEqual([]);
    expect(res.diagnostics.some((d) => d.id === DiagnosticIds.OpNoMatchingOverload)).toBe(true);
    expect(res.diagnostics.some((d) => d.message.includes('No matching op overload'))).toBe(true);
    expect(res.diagnostics.some((d) => d.message.includes('expects ea, got (p.lo)'))).toBe(true);
  });
});

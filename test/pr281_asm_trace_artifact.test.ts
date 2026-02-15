import { describe, expect, it } from 'vitest';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';
import type { AsmArtifact } from '../src/formats/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR281 asm trace artifact', () => {
  it('emits deterministic .asm with function boundaries and labels', async () => {
    const entry = join(__dirname, 'fixtures', 'pr23_implicit_ret_with_locals.zax');

    const run0 = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(run0.diagnostics).toEqual([]);
    const asm0 = run0.artifacts.find((a): a is AsmArtifact => a.kind === 'asm');
    expect(asm0).toBeDefined();
    expect(asm0!.text).toContain('; func main begin');
    expect(asm0!.text).toContain('main:');
    expect(asm0!.text).toContain('; func main end');

    const run1 = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(run1.diagnostics).toEqual([]);
    const asm1 = run1.artifacts.find((a): a is AsmArtifact => a.kind === 'asm');
    expect(asm1).toBeDefined();
    expect(asm1!.text).toBe(asm0!.text);
  });

  it('supports asm-only artifact generation via compile options', async () => {
    const entry = join(__dirname, 'fixtures', 'pr15_nested_select_if_while.zax');
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
    expect(res.artifacts.map((a) => a.kind)).toEqual(['asm']);
  });

  it('does not emit asm when compilation has errors', async () => {
    const entry = join(__dirname, 'fixtures', 'pr4_undefined_name.zax');
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

    expect(res.diagnostics.some((d) => d.severity === 'error')).toBe(true);
    expect(res.artifacts).toEqual([]);
  });
});

import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR37 fixup negatives', () => {
  it('diagnoses unresolved abs16 fixup symbols', async () => {
    const entry = join(__dirname, 'fixtures', 'pr37_unresolved_symbol_abs16.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.artifacts).toEqual([]);
    expect(
      res.diagnostics.some((d) => d.message.includes('Unresolved symbol "missing_label"')),
    ).toBe(true);
  });

  it('diagnoses unresolved rel8 fixup symbols', async () => {
    const entry = join(__dirname, 'fixtures', 'pr37_unresolved_symbol_rel8.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.artifacts).toEqual([]);
    expect(
      res.diagnostics.some((d) => d.message.includes('Unresolved symbol "missing_label"')),
    ).toBe(true);
    expect(res.diagnostics.some((d) => d.message.includes('rel8 jr fixup'))).toBe(true);
  });

  it('diagnoses rel8 out-of-range fixups', async () => {
    const entry = join(__dirname, 'fixtures', 'pr37_rel8_out_of_range.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.artifacts).toEqual([]);
    expect(
      res.diagnostics.some((d) => d.message.includes('jr target out of range for rel8 branch')),
    ).toBe(true);
  });

  it('diagnoses conditional jr rel8 out-of-range fixups', async () => {
    const entry = join(__dirname, 'fixtures', 'pr37_rel8_out_of_range_jr_cond.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.artifacts).toEqual([]);
    expect(
      res.diagnostics.some((d) => d.message.includes('jr nz target out of range for rel8 branch')),
    ).toBe(true);
  });

  it('diagnoses djnz rel8 out-of-range fixups', async () => {
    const entry = join(__dirname, 'fixtures', 'pr37_rel8_out_of_range_djnz.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.artifacts).toEqual([]);
    expect(
      res.diagnostics.some((d) => d.message.includes('djnz target out of range for rel8 branch')),
    ).toBe(true);
  });
});

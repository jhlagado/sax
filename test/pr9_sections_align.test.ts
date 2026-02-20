import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';
import type { BinArtifact, D8mArtifact } from '../src/formats/types.js';
import { DiagnosticIds } from '../src/diagnostics/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR9 sections + align', () => {
  it('applies align to the active section counter', async () => {
    const entry = join(__dirname, 'fixtures', 'pr9_align_between_funcs.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.diagnostics.some((d) => d.severity === 'error')).toBe(false);
  });

  it('supports section code at <imm> for base address', async () => {
    const entry = join(__dirname, 'fixtures', 'pr9_section_code_at.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.diagnostics.some((d) => d.severity === 'error')).toBe(false);
  });

  it('diagnoses overlaps when sections map to the same address', async () => {
    const entry = join(__dirname, 'fixtures', 'pr9_overlap_code_data.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.artifacts).toEqual([]);
    expect(res.diagnostics.map((d) => d.id)).toEqual(
      expect.arrayContaining([DiagnosticIds.EmitError]),
    );
    expect(res.diagnostics.map((d) => d.message)).toEqual(
      expect.arrayContaining([expect.stringContaining('Byte overlap')]),
    );
  });

  it('avoids cascaded overlap diagnostics when a section base is invalid', async () => {
    const entry = join(__dirname, 'fixtures', 'pr9_invalid_code_base_no_overlap.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.artifacts).toEqual([]);
    expect(res.diagnostics.map((d) => d.id)).toEqual(
      expect.arrayContaining([DiagnosticIds.EmitError]),
    );
    expect(res.diagnostics.map((d) => d.message)).toEqual(
      expect.arrayContaining([expect.stringContaining('base address out of range')]),
    );
    expect(res.diagnostics.map((d) => d.message)).toEqual(
      expect.not.arrayContaining([expect.stringContaining('Byte overlap')]),
    );
  });
});

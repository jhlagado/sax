import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';
import type { BinArtifact, D8mArtifact } from '../src/formats/types.js';
import { DiagnosticIds } from '../src/diagnostics/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR8 sizeof() in imm expressions', () => {
  it('evaluates sizeof(TypeName) using PR3 layouts', async () => {
    const entry = join(__dirname, 'fixtures', 'pr8_sizeof.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.diagnostics.some((d) => d.severity === 'error')).toBe(false);
  });

  it('diagnoses unknown types used in sizeof()', async () => {
    const entry = join(__dirname, 'fixtures', 'pr8_sizeof_unknown.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.artifacts).toEqual([]);
    expect(res.diagnostics.map((d) => d.id)).toEqual(
      expect.arrayContaining([DiagnosticIds.TypeError, DiagnosticIds.SemanticsError]),
    );
    expect(res.diagnostics.map((d) => d.message)).toEqual(
      expect.arrayContaining(['Unknown type "Nope".', 'Failed to evaluate const "SzNope".']),
    );
  });
});

import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';
import type { BinArtifact, D8mArtifact } from '../src/formats/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR4 enum parsing', () => {
  it('evaluates enum members in imm expressions', async () => {
    const entry = join(__dirname, 'fixtures', 'pr4_enum.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.diagnostics.some((d) => d.severity === 'error')).toBe(false);
  });

  it('rejects unqualified enum member references', async () => {
    const entry = join(__dirname, 'fixtures', 'pr259_enum_unqualified_member.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.artifacts).toEqual([]);
    expect(
      res.diagnostics.some((d) =>
        d.message.includes('Unqualified enum member "Write" is not allowed; use "Mode.Write".'),
      ),
    ).toBe(true);
    expect(res.diagnostics.some((d) => d.message.includes('Failed to evaluate const "Bad".'))).toBe(
      true,
    );
  });

  it('diagnoses ambiguous unqualified enum member references', async () => {
    const entry = join(__dirname, 'fixtures', 'pr265_enum_unqualified_ambiguous.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.artifacts).toEqual([]);
    expect(
      res.diagnostics.some((d) =>
        d.message.includes(
          'Unqualified enum member "On" is ambiguous; use one of: ModeA.On, ModeB.On.',
        ),
      ),
    ).toBe(true);
  });
});

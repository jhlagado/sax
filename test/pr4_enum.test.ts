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
    expect(res.diagnostics).toEqual([]);

    const bin = res.artifacts.find((a): a is BinArtifact => a.kind === 'bin');
    const d8m = res.artifacts.find((a): a is D8mArtifact => a.kind === 'd8m');
    expect(bin).toBeDefined();
    expect(d8m).toBeDefined();
    /* prologue preserve + ld a, 1 (Mode.Write index 1) + epilogue */
    expect(bin!.bytes).toEqual(Uint8Array.of(0xf5, 0xc5, 0xd5, 0x3e, 0x01, 0xd1, 0xc1, 0xf1, 0xc9));

    const symbols = d8m!.json['symbols'] as unknown as Array<{
      name: string;
      kind: string;
      address: number;
      value?: number;
      [k: string]: unknown;
    }>;
    expect(symbols).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'Mode.Read', kind: 'constant', value: 0 }),
        expect.objectContaining({ name: 'Mode.Write', kind: 'constant', value: 1 }),
        expect.objectContaining({ name: 'Mode.Append', kind: 'constant', value: 2 }),
      ]),
    );
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

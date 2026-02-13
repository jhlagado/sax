import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';
import type { BinArtifact, D8mArtifact } from '../src/formats/types.js';
import { DiagnosticIds } from '../src/diagnostics/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR257 offsetof() in imm expressions', () => {
  it('evaluates offsetof(Type, fieldPath) with records, arrays, and unions', async () => {
    const entry = join(__dirname, 'fixtures', 'pr257_offsetof_valid.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.diagnostics).toEqual([]);

    const bin = res.artifacts.find((a): a is BinArtifact => a.kind === 'bin');
    const d8m = res.artifacts.find((a): a is D8mArtifact => a.kind === 'd8m');
    expect(bin).toBeDefined();
    expect(d8m).toBeDefined();

    // ld a,1 ; ld hl,16 ; ld de,1 ; ret
    expect(bin!.bytes).toEqual(Uint8Array.of(0x3e, 0x01, 0x21, 0x10, 0x00, 0x11, 0x01, 0x00, 0xc9));

    const symbols = d8m!.json['symbols'] as unknown as Array<{
      name: string;
      kind: string;
      value?: number;
      [k: string]: unknown;
    }>;
    expect(symbols).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'OffY', kind: 'constant', value: 1 }),
        expect.objectContaining({ name: 'OffSpritesIdxColor', kind: 'constant', value: 16 }),
        expect.objectContaining({ name: 'OffPayloadWord', kind: 'constant', value: 1 }),
      ]),
    );
  });

  it('diagnoses invalid offsetof() paths and indices', async () => {
    const entry = join(__dirname, 'fixtures', 'pr257_offsetof_invalid.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.artifacts).toEqual([]);
    expect(res.diagnostics.map((d) => d.id)).toEqual(
      expect.arrayContaining([DiagnosticIds.TypeError, DiagnosticIds.SemanticsError]),
    );
    expect(res.diagnostics.map((d) => d.message)).toEqual(
      expect.arrayContaining([
        'Unknown field "z".',
        'Failed to evaluate offsetof index expression.',
        'offsetof index 9 out of bounds for length 4.',
        'Failed to evaluate const "BadField".',
        'Failed to evaluate const "BadIndexUnknown".',
        'Failed to evaluate const "BadIndexRange".',
      ]),
    );
  });
});

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
    /* ld a, 1 (Write is member index 1, 0-based); ret */
    expect(bin!.bytes).toEqual(Uint8Array.of(0x3e, 0x01, 0xc9));

    const symbols = d8m!.json['symbols'] as unknown as Array<{
      name: string;
      kind: string;
      address: number;
      [k: string]: unknown;
    }>;
    expect(symbols).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'Read', kind: 'constant', address: 0 }),
        expect.objectContaining({ name: 'Write', kind: 'constant', address: 1 }),
        expect.objectContaining({ name: 'Append', kind: 'constant', address: 2 }),
      ]),
    );
  });
});

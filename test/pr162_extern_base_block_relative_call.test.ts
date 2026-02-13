import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';
import type { BinArtifact, D8mArtifact } from '../src/formats/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR162 lowering: extern <binName> relative call support', () => {
  it('resolves extern offsets against bin base and calls through resolved symbol', async () => {
    const entry = join(__dirname, 'fixtures', 'pr162_extern_base_block_relative_call.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.diagnostics).toEqual([]);

    const bin = res.artifacts.find((a): a is BinArtifact => a.kind === 'bin');
    const d8m = res.artifacts.find((a): a is D8mArtifact => a.kind === 'd8m');
    expect(bin).toBeDefined();
    expect(d8m).toBeDefined();

    expect(bin!.bytes).toEqual(
      Uint8Array.of(
        0xaa,
        0xbb,
        0xcc,
        0xf5,
        0xc5,
        0xd5,
        0xdd,
        0xe5,
        0xfd,
        0xe5,
        0xe5,
        0x21,
        0x07,
        0x00,
        0xe5,
        0xcd,
        0x02,
        0x00,
        0xc1,
        0xe1,
        0xfd,
        0xe1,
        0xdd,
        0xe1,
        0xd1,
        0xc1,
        0xf1,
        0xc9,
      ),
    );

    const symbols = d8m!.json['symbols'] as Array<{ name: string; address: number; kind: string }>;
    expect(symbols).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'legacy_putc', address: 0x0002 })]),
    );
  });
});

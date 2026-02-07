import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';
import type { BinArtifact, D8mArtifact } from '../src/formats/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR2 const + data', () => {
  it('evaluates consts and emits packed data', async () => {
    const entry = join(__dirname, 'fixtures', 'pr2_const_data.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.diagnostics).toEqual([]);

    const bin = res.artifacts.find((a): a is BinArtifact => a.kind === 'bin');
    const d8m = res.artifacts.find((a): a is D8mArtifact => a.kind === 'd8m');
    expect(bin).toBeDefined();
    expect(d8m).toBeDefined();

    expect(bin!.bytes).toEqual(Uint8Array.of(0x3e, 0x05, 0xc9, 0x00, 0x48, 0x45, 0x4c, 0x4c, 0x4f));

    const symbols = (d8m!.json as any).symbols as Array<{
      name: string;
      kind: string;
      address: number;
      [k: string]: unknown;
    }>;
    expect(symbols).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'MsgLen', kind: 'constant', address: 5 }),
        expect.objectContaining({ name: 'msg', kind: 'data', address: 4 }),
      ]),
    );
  });
});

import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';
import type { BinArtifact } from '../src/formats/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR262 nested runtime index lowering for ld forms', () => {
  it('preserves A while lowering ld grid[row][col], a', async () => {
    const entry = join(__dirname, 'fixtures', 'pr262_ld_nested_runtime_index.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.diagnostics).toEqual([]);

    const bin = res.artifacts.find((a): a is BinArtifact => a.kind === 'bin');
    expect(bin).toBeDefined();
    expect(bin!.bytes).toEqual(
      Uint8Array.of(
        // ld a, grid[row][col]
        0x3a,
        0x01,
        0x10,
        0x26,
        0x00,
        0x6f,
        0xe5,
        0xe1,
        0xe5,
        0x3a,
        0x00,
        0x10,
        0x26,
        0x00,
        0x6f,
        0xe5,
        0xe1,
        0x29,
        0x29,
        0xe5,
        0x21,
        0x02,
        0x10,
        0xd1,
        0x19,
        0xe5,
        0xe1,
        0xd1,
        0x19,
        0xe5,
        0xe1,
        0x7e,
        // ld grid[row][col], a (with AF preservation)
        0xf5,
        0x3a,
        0x01,
        0x10,
        0x26,
        0x00,
        0x6f,
        0xe5,
        0xe1,
        0xe5,
        0x3a,
        0x00,
        0x10,
        0x26,
        0x00,
        0x6f,
        0xe5,
        0xe1,
        0x29,
        0x29,
        0xe5,
        0x21,
        0x02,
        0x10,
        0xd1,
        0x19,
        0xe5,
        0xe1,
        0xd1,
        0x19,
        0xe5,
        0xe1,
        0xf1,
        0x77,
        0xc9,
      ),
    );
  });
});

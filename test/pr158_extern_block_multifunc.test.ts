import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';
import type { BinArtifact } from '../src/formats/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR158 parser/lowering: extern block with multiple funcs', () => {
  it('parses extern block form and lowers calls to each extern func', async () => {
    const entry = join(__dirname, 'fixtures', 'pr158_extern_block_multifunc.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.diagnostics).toEqual([]);

    const bin = res.artifacts.find((a): a is BinArtifact => a.kind === 'bin');
    expect(bin).toBeDefined();

    // puts 7; puts2 8; ret
    expect(bin!.bytes).toEqual(
      Uint8Array.of(
        0x21,
        0x07,
        0x00,
        0xe5,
        0xcd,
        0x34,
        0x12,
        0xc1,
        0x21,
        0x08,
        0x00,
        0xe5,
        0xcd,
        0x40,
        0x12,
        0xc1,
        0xc9,
      ),
    );
  });
});

import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';
import type { BinArtifact } from '../src/formats/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR56: ISA misc single-byte ops', () => {
  it('encodes common misc ops', async () => {
    const entry = join(__dirname, 'fixtures', 'pr56_isa_misc.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.diagnostics).toEqual([]);

    const bin = res.artifacts.find((a): a is BinArtifact => a.kind === 'bin');
    expect(bin).toBeDefined();
    // prologue preserve + misc ops + epilogue ret
    expect(bin!.bytes).toEqual(
      Uint8Array.of(
        0xf5,
        0xc5,
        0xd5, // prologue
        0xf3,
        0xfb,
        0x37,
        0x3f,
        0x2f,
        0xeb,
        0xe3,
        0xd9,
        0x76, // body
        0xd1,
        0xc1,
        0xf1,
        0xc9, // epilogue
      ),
    );
  });
});

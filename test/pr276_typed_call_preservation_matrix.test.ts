import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';
import type { BinArtifact } from '../src/formats/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR276: typed-call preservation wrappers (void vs non-void)', () => {
  it('keeps HL preserved for void calls and exposes HL for non-void calls', async () => {
    const entry = join(__dirname, 'fixtures', 'pr276_typed_call_preservation_matrix.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.diagnostics).toEqual([]);

    const bin = res.artifacts.find((a): a is BinArtifact => a.kind === 'bin');
    expect(bin).toBeDefined();
    expect(bin!.bytes).toEqual(
      Uint8Array.of(
        // ping 1 (void): preserve AF/BC/DE/IX/IY/HL
        0xf5,
        0xc5,
        0xd5,
        0xdd,
        0xe5,
        0xfd,
        0xe5,
        0xe5,
        0x21,
        0x01,
        0x00,
        0xe5,
        0xcd,
        0x50,
        0x12,
        0xc1,
        0xe1,
        0xfd,
        0xe1,
        0xdd,
        0xe1,
        0xd1,
        0xc1,
        0xf1,
        // getb 7 (byte return): HL is return channel, so no HL preserve/restore
        0xf5,
        0xc5,
        0xd5,
        0xdd,
        0xe5,
        0xfd,
        0xe5,
        0x21,
        0x07,
        0x00,
        0xe5,
        0xcd,
        0x34,
        0x12,
        0xc1,
        0xfd,
        0xe1,
        0xdd,
        0xe1,
        0xd1,
        0xc1,
        0xf1,
        0x7d, // ld a, l
        // getw 9 (word return): HL remains visible return channel
        0xf5,
        0xc5,
        0xd5,
        0xdd,
        0xe5,
        0xfd,
        0xe5,
        0x21,
        0x09,
        0x00,
        0xe5,
        0xcd,
        0x40,
        0x12,
        0xc1,
        0xfd,
        0xe1,
        0xdd,
        0xe1,
        0xd1,
        0xc1,
        0xf1,
        0x22,
        0x00,
        0x10, // ld ($1000), hl
        0xc9, // ret
      ),
    );
  });
});

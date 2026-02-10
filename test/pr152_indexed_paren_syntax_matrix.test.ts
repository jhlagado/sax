import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';
import type { BinArtifact } from '../src/formats/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR152: indexed parenthesized syntax matrix', () => {
  it('encodes (ix+disp)/(iy+disp) forms across ld/inc/dec/alu/cb families', async () => {
    const entry = join(__dirname, 'fixtures', 'pr152_indexed_paren_syntax_matrix.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.diagnostics).toEqual([]);

    const bin = res.artifacts.find((a): a is BinArtifact => a.kind === 'bin');
    expect(bin).toBeDefined();
    expect(bin!.bytes).toEqual(
      Uint8Array.of(
        0xdd,
        0x7e,
        0x05, // ld a,(ix+5)
        0xfd,
        0x70,
        0xfe, // ld (iy-2),b
        0xdd,
        0x34,
        0x01, // inc (ix+1)
        0xfd,
        0x35,
        0xff, // dec (iy-1)
        0xdd,
        0x86,
        0x02, // add a,(ix+2)
        0xfd,
        0xcb,
        0x04,
        0x5e, // bit 3,(iy+4)
        0xdd,
        0xcb,
        0x06,
        0x90, // res 2,(ix+6),b
        0xfd,
        0xcb,
        0x07,
        0x17, // rl (iy+7),a
        0xdd,
        0xcb,
        0x08,
        0x36, // sll (ix+8)
        0xc9, // implicit ret
      ),
    );
  });
});

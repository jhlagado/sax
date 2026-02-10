import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';
import type { BinArtifact } from '../src/formats/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR107: ISA IX/IY 16-bit family', () => {
  it('encodes indexed 16-bit add/inc/dec/push/pop/ld sp forms', async () => {
    const entry = join(__dirname, 'fixtures', 'pr107_isa_ixiy_16bit_family.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.diagnostics).toEqual([]);

    const bin = res.artifacts.find((a): a is BinArtifact => a.kind === 'bin');
    expect(bin).toBeDefined();
    expect(bin!.bytes).toEqual(
      Uint8Array.of(
        0xdd,
        0x09, // add ix,bc
        0xdd,
        0x29, // add ix,ix
        0xfd,
        0x39, // add iy,sp
        0xdd,
        0x23, // inc ix
        0xfd,
        0x2b, // dec iy
        0xdd,
        0xe5, // push ix
        0xfd,
        0xe1, // pop iy
        0xdd,
        0xf9, // ld sp,ix
        0xfd,
        0xf9, // ld sp,iy
        0xc9, // ret
      ),
    );
  });
});

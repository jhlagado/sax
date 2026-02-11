import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';
import type { BinArtifact } from '../src/formats/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR201: ISA indexed zero-disp shorthand forms', () => {
  it('encodes (ix)/(iy) as indexed disp=0 across ALU/CB/bit families', async () => {
    const entry = join(__dirname, 'fixtures', 'pr201_isa_indexed_zero_disp_forms.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.diagnostics).toEqual([]);

    const bin = res.artifacts.find((a): a is BinArtifact => a.kind === 'bin');
    expect(bin).toBeDefined();
    expect(bin!.bytes).toEqual(
      Uint8Array.of(
        0xdd,
        0x7e,
        0x00, // ld a,(ix)
        0xfd,
        0x77,
        0x00, // ld (iy),a
        0xdd,
        0x34,
        0x00, // inc (ix)
        0xfd,
        0x35,
        0x00, // dec (iy)
        0xdd,
        0x86,
        0x00, // add a,(ix)
        0xfd,
        0x96,
        0x00, // sub (iy)
        0xdd,
        0x8e,
        0x00, // adc a,(ix)
        0xfd,
        0x9e,
        0x00, // sbc a,(iy)
        0xdd,
        0xa6,
        0x00, // and (ix)
        0xfd,
        0xae,
        0x00, // xor (iy)
        0xdd,
        0xb6,
        0x00, // or (ix)
        0xfd,
        0xbe,
        0x00, // cp (iy)
        0xdd,
        0xcb,
        0x00,
        0x06, // rlc (ix)
        0xfd,
        0xcb,
        0x00,
        0x1e, // rr (iy)
        0xdd,
        0xcb,
        0x00,
        0x5e, // bit 3,(ix)
        0xfd,
        0xcb,
        0x00,
        0xa6, // res 4,(iy)
        0xdd,
        0xcb,
        0x00,
        0xe8, // set 5,(ix),b
        0xc9, // ret
      ),
    );
  });
});

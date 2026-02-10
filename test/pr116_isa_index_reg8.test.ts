import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';
import type { BinArtifact } from '../src/formats/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR116 ISA: IXH/IXL/IYH/IYL byte registers', () => {
  it('encodes ld/inc/dec and ALU-A forms for indexed byte registers', async () => {
    const entry = join(__dirname, 'fixtures', 'pr116_isa_index_reg8.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.diagnostics).toEqual([]);

    const bin = res.artifacts.find((a): a is BinArtifact => a.kind === 'bin');
    expect(bin).toBeDefined();
    expect(bin!.bytes).toEqual(
      Uint8Array.of(
        0xdd,
        0x26,
        0x12, // ld ixh,$12
        0xdd,
        0x2e,
        0x34, // ld ixl,$34
        0xfd,
        0x26,
        0x56, // ld iyh,$56
        0xfd,
        0x2e,
        0x78, // ld iyl,$78
        0xdd,
        0x7c, // ld a,ixh
        0xdd,
        0x45, // ld b,ixl
        0xdd,
        0x67, // ld ixh,a
        0xfd,
        0x69, // ld iyl,c
        0xdd,
        0x24, // inc ixh
        0xdd,
        0x2d, // dec ixl
        0xfd,
        0x24, // inc iyh
        0xfd,
        0x2d, // dec iyl
        0xdd,
        0x84, // add a,ixh
        0xfd,
        0x8d, // adc a,iyl
        0xdd,
        0x95, // sub ixl
        0xfd,
        0x9c, // sbc a,iyh
        0xdd,
        0xa4, // and ixh
        0xfd,
        0xad, // xor iyl
        0xfd,
        0xb4, // or iyh
        0xdd,
        0xbd, // cp ixl
        0xc9,
      ),
    );
  });

  it('diagnoses invalid mixed IX*/IY* transfer', async () => {
    const entry = join(__dirname, 'fixtures', 'pr116_isa_index_reg8_invalid.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(
      res.diagnostics.some((d) => d.message.includes('ld between IX* and IY* byte registers')),
    ).toBe(true);
  });
});

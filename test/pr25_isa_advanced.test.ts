import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';
import type { BinArtifact } from '../src/formats/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR25 ISA advanced tranche', () => {
  it('encodes adc/sbc, bit/set/res, and conditional jp/call', async () => {
    const entry = join(__dirname, 'fixtures', 'pr25_isa_advanced.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.diagnostics).toEqual([]);

    const bin = res.artifacts.find((a): a is BinArtifact => a.kind === 'bin');
    expect(bin).toBeDefined();
    expect(bin!.bytes).toEqual(
      Uint8Array.of(
        0x88, // adc a,b
        0x8e, // adc a,(hl)
        0xce,
        0x01, // adc a,1
        0x99, // sbc a,c
        0x9e, // sbc a,(hl)
        0xde,
        0x02, // sbc a,2
        0xcb,
        0x58, // bit 3,b
        0xcb,
        0x46, // bit 0,(hl)
        0xcb,
        0xe7, // set 4,a
        0xcb,
        0x96, // res 2,(hl)
        0xc2,
        0x34,
        0x12, // jp nz,$1234
        0xcc,
        0x67,
        0x45, // call z,$4567
        0xc9, // implicit return on fallthrough
      ),
    );
  });

  it('diagnoses invalid bit index outside 0..7', async () => {
    const entry = join(__dirname, 'fixtures', 'pr25_bit_index_oob.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.artifacts).toEqual([]);
    expect(res.diagnostics.some((d) => d.message.includes('bit expects bit index 0..7'))).toBe(
      true,
    );
  });

  it('encodes parity/sign conditional jp/call and label-target fixups', async () => {
    const entry = join(__dirname, 'fixtures', 'pr25_conditional_control_forms.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.diagnostics).toEqual([]);

    const bin = res.artifacts.find((a): a is BinArtifact => a.kind === 'bin');
    expect(bin).toBeDefined();
    expect(bin!.bytes).toEqual(
      Uint8Array.of(
        0xe2,
        0x00,
        0x10, // jp po, $1000
        0xfa,
        0x00,
        0x20, // jp m, $2000
        0xec,
        0x00,
        0x30, // call pe, $3000
        0xc2,
        0x0d,
        0x00, // jp nz, skip
        0x00, // nop
        0xdc,
        0x10,
        0x00, // call c, tail
        0xc9, // implicit return at tail
      ),
    );
  });
});

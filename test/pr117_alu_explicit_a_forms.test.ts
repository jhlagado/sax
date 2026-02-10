import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';
import type { BinArtifact } from '../src/formats/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR117 ISA: explicit accumulator ALU forms', () => {
  it('encodes and/or/xor/cp with explicit A destination', async () => {
    const entry = join(__dirname, 'fixtures', 'pr117_alu_explicit_a_forms.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.diagnostics).toEqual([]);

    const bin = res.artifacts.find((a): a is BinArtifact => a.kind === 'bin');
    expect(bin).toBeDefined();
    expect(bin!.bytes).toEqual(
      Uint8Array.of(
        0xa0, // and a,b
        0xa6, // and a,(hl)
        0xe6,
        0x12, // and a,$12
        0xdd,
        0xa4, // and a,ixh
        0xfd,
        0xb5, // or a,iyl
        0xdd,
        0xae,
        0x02, // xor a,(ix+2)
        0xfd,
        0xbe,
        0xff, // cp a,(iy-1)
        0xfe,
        0x34, // cp a,$34
        0xc9,
      ),
    );
  });
});

import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';
import type { BinArtifact } from '../src/formats/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR110: ld abs16 IX/IY forms', () => {
  it('encodes ld ix/iy,(nn) and ld (nn),ix/iy for absolute EA', async () => {
    const entry = join(__dirname, 'fixtures', 'pr110_isa_ixiy_abs16_forms.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.diagnostics).toEqual([]);

    const bin = res.artifacts.find((a): a is BinArtifact => a.kind === 'bin');
    expect(bin).toBeDefined();

    // var section at $1000: w0=$1000, w1=$1002
    expect(bin!.bytes).toEqual(
      Uint8Array.of(
        0xdd,
        0x2a,
        0x00,
        0x10, // ld ix, ($1000)
        0xdd,
        0x22,
        0x00,
        0x10, // ld ($1000), ix
        0xfd,
        0x2a,
        0x02,
        0x10, // ld iy, ($1002)
        0xfd,
        0x22,
        0x02,
        0x10, // ld ($1002), iy
        0xc9, // implicit ret
      ),
    );
  });
});

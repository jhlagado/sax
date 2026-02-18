import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';
import type { BinArtifact } from '../src/formats/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe.skip('PR45: ld abs16 ED forms (BC/DE/SP)', () => {
  it('encodes ld rr,(nn) and ld (nn),rr for BC/DE/SP when EA is absolute', async () => {
    const entry = join(__dirname, 'fixtures', 'pr45_ld_abs16_ed_forms.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.diagnostics).toEqual([]);

    const bin = res.artifacts.find((a): a is BinArtifact => a.kind === 'bin');
    expect(bin).toBeDefined();

    // var section at $1000: w0=$1000, w1=$1002, w2=$1004
    expect(bin!.bytes).toEqual(
      Uint8Array.of(
        0xed,
        0x4b,
        0x00,
        0x10, // ld bc, ($1000)
        0xed,
        0x43,
        0x00,
        0x10, // ld ($1000), bc
        0xed,
        0x5b,
        0x02,
        0x10, // ld de, ($1002)
        0xed,
        0x53,
        0x02,
        0x10, // ld ($1002), de
        0xed,
        0x7b,
        0x04,
        0x10, // ld sp, ($1004)
        0xed,
        0x73,
        0x04,
        0x10, // ld ($1004), sp
        0xc9, // implicit ret
      ),
    );
  });
});

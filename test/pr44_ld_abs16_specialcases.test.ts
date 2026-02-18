import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';
import type { BinArtifact } from '../src/formats/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe.skip('PR44: ld abs16 special-cases in lowering', () => {
  it('uses ld a,(nn), ld (nn),a, ld hl,(nn), ld (nn),hl when EA is absolute', async () => {
    const entry = join(__dirname, 'fixtures', 'pr44_ld_abs16_specialcases.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.diagnostics).toEqual([]);

    const bin = res.artifacts.find((a): a is BinArtifact => a.kind === 'bin');
    expect(bin).toBeDefined();

    // var section at $1000:
    // x: byte[2] => x=$1000, x+1=$1001
    // y: word => aligned => y=$1002
    expect(bin!.bytes).toEqual(
      Uint8Array.of(
        0x3a,
        0x00,
        0x10, // ld a, ($1000)
        0x32,
        0x01,
        0x10, // ld ($1001), a
        0x2a,
        0x02,
        0x10, // ld hl, ($1002)
        0x22,
        0x02,
        0x10, // ld ($1002), hl
        0xc9, // implicit ret
      ),
    );
  });
});

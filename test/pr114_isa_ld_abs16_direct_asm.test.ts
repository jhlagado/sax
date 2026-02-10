import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';
import type { BinArtifact } from '../src/formats/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR114 ISA: direct asm ld abs16 families', () => {
  it('encodes ld rr,(nn) and ld (nn),rr for A/HL/BC/DE/SP/IX/IY', async () => {
    const entry = join(__dirname, 'fixtures', 'pr114_isa_ld_abs16_direct_asm.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.diagnostics).toEqual([]);

    const bin = res.artifacts.find((a): a is BinArtifact => a.kind === 'bin');
    expect(bin).toBeDefined();
    expect(bin!.bytes).toEqual(
      Uint8Array.of(
        0x3a,
        0x10,
        0x10, // ld a,(b0)
        0x32,
        0x10,
        0x10, // ld (b0),a
        0x2a,
        0x00,
        0x10, // ld hl,(w0)
        0x22,
        0x00,
        0x10, // ld (w0),hl
        0xed,
        0x4b,
        0x02,
        0x10, // ld bc,(w1)
        0xed,
        0x43,
        0x02,
        0x10, // ld (w1),bc
        0xed,
        0x5b,
        0x04,
        0x10, // ld de,(w2)
        0xed,
        0x53,
        0x04,
        0x10, // ld (w2),de
        0xed,
        0x7b,
        0x06,
        0x10, // ld sp,(w3)
        0xed,
        0x73,
        0x06,
        0x10, // ld (w3),sp
        0xdd,
        0x2a,
        0x08,
        0x10, // ld ix,(w4)
        0xdd,
        0x22,
        0x08,
        0x10, // ld (w4),ix
        0xfd,
        0x2a,
        0x0a,
        0x10, // ld iy,(w5)
        0xfd,
        0x22,
        0x0a,
        0x10, // ld (w5),iy
        0xc9,
      ),
    );
  });
});

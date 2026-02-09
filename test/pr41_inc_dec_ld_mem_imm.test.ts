import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';
import type { BinArtifact } from '../src/formats/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR41 ISA: inc/dec r8 and ld (hl), imm8', () => {
  it('encodes inc/dec for r8 and (hl), plus ld (hl), n', async () => {
    const entry = join(__dirname, 'fixtures', 'pr41_inc_dec_ld_mem_imm.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.diagnostics).toEqual([]);

    const bin = res.artifacts.find((a): a is BinArtifact => a.kind === 'bin');
    expect(bin).toBeDefined();

    // ld hl, $1000
    // ld (hl), $2A
    // inc a; dec a
    // inc (hl); dec (hl)
    // inc b; dec c
    // implicit ret
    expect(bin!.bytes).toEqual(
      Uint8Array.of(0x21, 0x00, 0x10, 0x36, 0x2a, 0x3c, 0x3d, 0x34, 0x35, 0x04, 0x0d, 0xc9),
    );
  });
});

import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';
import type { BinArtifact } from '../src/formats/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('ISA: block instructions (LDI/LDIR/LDD/LDDR/CPI/CPIR/CPD/CPDR)', () => {
  it('encodes ED block instructions', async () => {
    const entry = join(__dirname, 'fixtures', 'isa_block_instructions.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.diagnostics).toEqual([]);

    const bin = res.artifacts.find((a): a is BinArtifact => a.kind === 'bin');
    expect(bin).toBeDefined();
    // ldi; ldir; ldd; lddr; cpi; cpir; cpd; cpdr; implicit ret
    expect(bin!.bytes).toEqual(
      Uint8Array.of(
        0xed,
        0xa0,
        0xed,
        0xb0,
        0xed,
        0xa8,
        0xed,
        0xb8,
        0xed,
        0xa1,
        0xed,
        0xb1,
        0xed,
        0xa9,
        0xed,
        0xb9,
        0xc9,
      ),
    );
  });
});

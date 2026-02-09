import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';
import type { BinArtifact } from '../src/formats/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('ISA: ED block I/O instructions (INI/INIR/IND/INDR/OUTI/OTIR/OUTD/OTDR)', () => {
  it('encodes ED block I/O instructions', async () => {
    const entry = join(__dirname, 'fixtures', 'isa_block_io_instructions.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.diagnostics).toEqual([]);

    const bin = res.artifacts.find((a): a is BinArtifact => a.kind === 'bin');
    expect(bin).toBeDefined();
    // ini; inir; ind; indr; outi; otir; outd; otdr; implicit ret
    expect(bin!.bytes).toEqual(
      Uint8Array.of(
        0xed,
        0xa2,
        0xed,
        0xb2,
        0xed,
        0xaa,
        0xed,
        0xba,
        0xed,
        0xa3,
        0xed,
        0xb3,
        0xed,
        0xab,
        0xed,
        0xbb,
        0xc9,
      ),
    );
  });
});

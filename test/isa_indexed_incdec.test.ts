import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';
import type { BinArtifact } from '../src/formats/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('ISA: indexed inc/dec (IX/IY + disp8)', () => {
  it('encodes inc/dec (ix/iy+disp)', async () => {
    const entry = join(__dirname, 'fixtures', 'isa_indexed_incdec.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.diagnostics).toEqual([]);

    const bin = res.artifacts.find((a): a is BinArtifact => a.kind === 'bin');
    expect(bin).toBeDefined();
    // inc (ix+1); dec (iy-1); implicit ret
    expect(bin!.bytes).toEqual(Uint8Array.of(0xdd, 0x34, 0x01, 0xfd, 0x35, 0xff, 0xc9));
  });
});

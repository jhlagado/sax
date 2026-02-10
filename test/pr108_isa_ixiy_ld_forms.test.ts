import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';
import type { BinArtifact } from '../src/formats/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR108: ISA IX/IY ld forms', () => {
  it('encodes ld ix/iy,nn forms', async () => {
    const entry = join(__dirname, 'fixtures', 'pr108_isa_ixiy_ld_forms.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.diagnostics).toEqual([]);

    const bin = res.artifacts.find((a): a is BinArtifact => a.kind === 'bin');
    expect(bin).toBeDefined();
    expect(bin!.bytes).toEqual(
      Uint8Array.of(
        0xdd,
        0x21,
        0x34,
        0x12, // ld ix,0x1234
        0xfd,
        0x21,
        0x78,
        0x56, // ld iy,0x5678
        0xc9, // ret
      ),
    );
  });
});

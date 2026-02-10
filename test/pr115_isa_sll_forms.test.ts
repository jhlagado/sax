import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';
import type { BinArtifact } from '../src/formats/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR115 ISA: sll forms', () => {
  it('encodes sll for reg/(hl)/(ix/iy+disp) and indexed destination form', async () => {
    const entry = join(__dirname, 'fixtures', 'pr115_isa_sll_forms.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.diagnostics).toEqual([]);

    const bin = res.artifacts.find((a): a is BinArtifact => a.kind === 'bin');
    expect(bin).toBeDefined();
    expect(bin!.bytes).toEqual(
      Uint8Array.of(
        0xcb,
        0x37, // sll a
        0xcb,
        0x36, // sll (hl)
        0xdd,
        0xcb,
        0x03,
        0x36, // sll (ix+3)
        0xfd,
        0xcb,
        0xfc,
        0x31, // sll (iy-4),c
        0xc9,
      ),
    );
  });
});

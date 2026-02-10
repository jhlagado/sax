import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';
import type { BinArtifact } from '../src/formats/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR118 ISA: indexed byte-register memory forms', () => {
  it('encodes IXH/IXL and IYH/IYL loads to/from indexed memory', async () => {
    const entry = join(__dirname, 'fixtures', 'pr118_index_reg8_mem_forms.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.diagnostics).toEqual([]);

    const bin = res.artifacts.find((a): a is BinArtifact => a.kind === 'bin');
    expect(bin).toBeDefined();
    expect(bin!.bytes).toEqual(
      Uint8Array.of(
        0xdd,
        0x66,
        0x03, // ld ixh,(ix+3)
        0xdd,
        0x6e,
        0xfe, // ld ixl,(ix-2)
        0xdd,
        0x74,
        0x04, // ld (ix+4),ixh
        0xdd,
        0x75,
        0xfb, // ld (ix-5),ixl
        0xfd,
        0x66,
        0x06, // ld iyh,(iy+6)
        0xfd,
        0x6e,
        0xf9, // ld iyl,(iy-7)
        0xfd,
        0x74,
        0x08, // ld (iy+8),iyh
        0xfd,
        0x75,
        0xf7, // ld (iy-9),iyl
        0xc9,
      ),
    );
  });

  it('diagnoses index-family mismatch and non-indexed destinations', async () => {
    const entry = join(__dirname, 'fixtures', 'pr118_index_reg8_mem_invalid.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    const messages = res.diagnostics.map((d) => d.message);
    expect(
      messages.some((m) => m.includes('source index base must match destination family')),
    ).toBe(true);
    expect(messages.some((m) => m.includes('destination expects (ix+disp)'))).toBe(true);
    expect(
      messages.some((m) => m.includes('destination index base must match source IXH family')),
    ).toBe(true);
  });
});

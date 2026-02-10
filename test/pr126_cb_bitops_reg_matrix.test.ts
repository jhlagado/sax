import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';
import type { BinArtifact } from '../src/formats/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR126 ISA: CB bit/res/set reg matrix', () => {
  it('encodes bit/res/set across reg8 + (hl) and all bit indices', async () => {
    const entry = join(__dirname, 'fixtures', 'pr126_cb_bitops_reg_matrix.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.diagnostics).toEqual([]);

    const bin = res.artifacts.find((a): a is BinArtifact => a.kind === 'bin');
    expect(bin).toBeDefined();
    expect(bin!.bytes).toEqual(
      Uint8Array.of(
        0xcb,
        0x40,
        0xcb,
        0x49,
        0xcb,
        0x52,
        0xcb,
        0x5b,
        0xcb,
        0x64,
        0xcb,
        0x6d,
        0xcb,
        0x76,
        0xcb,
        0x7f,
        0xcb,
        0x80,
        0xcb,
        0x89,
        0xcb,
        0x92,
        0xcb,
        0x9b,
        0xcb,
        0xa4,
        0xcb,
        0xad,
        0xcb,
        0xb6,
        0xcb,
        0xbf,
        0xcb,
        0xc0,
        0xcb,
        0xc9,
        0xcb,
        0xd2,
        0xcb,
        0xdb,
        0xcb,
        0xe4,
        0xcb,
        0xed,
        0xcb,
        0xf6,
        0xcb,
        0xff,
        0xc9,
      ),
    );
  });

  it('diagnoses invalid bit indices for reg8', async () => {
    const entry = join(__dirname, 'fixtures', 'pr126_cb_bitops_invalid_reg_matrix.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.artifacts).toEqual([]);
    expect(res.diagnostics.some((d) => d.message.includes('expects bit index 0..7'))).toBe(true);
  });
});

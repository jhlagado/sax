import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';
import type { BinArtifact } from '../src/formats/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR122 ISA: CB bit/res/set core forms', () => {
  it('encodes bit/res/set for reg8 and (hl)', async () => {
    const entry = join(__dirname, 'fixtures', 'pr122_isa_cb_bitops.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.diagnostics).toEqual([]);

    const bin = res.artifacts.find((a): a is BinArtifact => a.kind === 'bin');
    expect(bin).toBeDefined();
    expect(bin!.bytes).toEqual(
      Uint8Array.of(
        0xcb,
        0x40, // bit 0,b
        0xcb,
        0x7f, // bit 7,a
        0xcb,
        0x5e, // bit 3,(hl)
        0xcb,
        0x89, // res 1,c
        0xcb,
        0xb6, // res 6,(hl)
        0xcb,
        0xd2, // set 2,d
        0xcb,
        0xee, // set 5,(hl)
        0xc9, // ret (implicit epilogue)
      ),
    );
  });

  it('diagnoses invalid bit indices', async () => {
    const entry = join(__dirname, 'fixtures', 'pr122_isa_cb_bitops_invalid.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.artifacts).toEqual([]);
    expect(res.diagnostics.some((d) => d.message.includes('expects bit index 0..7'))).toBe(true);
  });
});

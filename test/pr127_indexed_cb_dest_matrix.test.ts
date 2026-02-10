import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';
import type { BinArtifact } from '../src/formats/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR127 ISA: indexed CB destination matrix', () => {
  it('encodes indexed rotate/shift and bit/res/set destination forms', async () => {
    const entry = join(__dirname, 'fixtures', 'pr127_indexed_cb_dest_matrix.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.diagnostics).toEqual([]);

    const bin = res.artifacts.find((a): a is BinArtifact => a.kind === 'bin');
    expect(bin).toBeDefined();
    expect(bin!.bytes).toEqual(
      Uint8Array.of(
        0xdd,
        0xcb,
        0x01,
        0x00, // rlc (ix+1),b
        0xfd,
        0xcb,
        0xfe,
        0x0f, // rrc (iy-2),a
        0xdd,
        0xcb,
        0x03,
        0x11, // rl (ix+3),c
        0xfd,
        0xcb,
        0xfc,
        0x1a, // rr (iy-4),d
        0xdd,
        0xcb,
        0x05,
        0x23, // sla (ix+5),e
        0xfd,
        0xcb,
        0xfa,
        0x2c, // sra (iy-6),h
        0xdd,
        0xcb,
        0x07,
        0x3d, // srl (ix+7),l
        0xfd,
        0xcb,
        0xf8,
        0x37, // sll (iy-8),a
        0xdd,
        0xcb,
        0x09,
        0x46, // bit 0,(ix+9)
        0xfd,
        0xcb,
        0xf6,
        0x7e, // bit 7,(iy-10)
        0xdd,
        0xcb,
        0x0b,
        0x90, // res 2,(ix+11),b
        0xfd,
        0xcb,
        0xf4,
        0xa9, // res 5,(iy-12),c
        0xdd,
        0xcb,
        0x0d,
        0xda, // set 3,(ix+13),d
        0xfd,
        0xcb,
        0xf2,
        0xf3, // set 6,(iy-14),e
        0xc9, // ret (implicit epilogue)
      ),
    );
  });

  it('diagnoses invalid indexed destination forms', async () => {
    const entry = join(__dirname, 'fixtures', 'pr127_indexed_cb_dest_invalid.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.artifacts).toEqual([]);
    const messages = res.diagnostics.map((d) => d.message);
    expect(messages.some((m) => m.includes('requires (ix/iy+disp) source'))).toBe(true);
    expect(messages.some((m) => m.includes('expects reg8 destination'))).toBe(true);
  });
});

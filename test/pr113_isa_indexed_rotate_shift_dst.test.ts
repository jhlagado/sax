import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';
import type { BinArtifact } from '../src/formats/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR113: indexed rotate/shift with destination register', () => {
  it('encodes CB indexed two-operand forms for full rotate/shift family', async () => {
    const entry = join(__dirname, 'fixtures', 'pr113_isa_indexed_rotate_shift_dst.zax');
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
        0xff,
        0x09, // rrc (iy-1),c
        0xdd,
        0xcb,
        0x02,
        0x12, // rl (ix+2),d
        0xfd,
        0xcb,
        0xfe,
        0x1b, // rr (iy-2),e
        0xdd,
        0xcb,
        0x03,
        0x24, // sla (ix+3),h
        0xfd,
        0xcb,
        0xfd,
        0x2d, // sra (iy-3),l
        0xdd,
        0xcb,
        0x04,
        0x3f, // srl (ix+4),a
        0xc9, // ret
      ),
    );
  });
});

import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';
import type { BinArtifact } from '../src/formats/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR27 CB rotate/shift family', () => {
  it('encodes rl/rr/sla/sra/srl for reg8 and (hl)', async () => {
    const entry = join(__dirname, 'fixtures', 'pr27_cb_rotates_shifts.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.diagnostics).toEqual([]);

    const bin = res.artifacts.find((a): a is BinArtifact => a.kind === 'bin');
    expect(bin).toBeDefined();
    expect(bin!.bytes).toEqual(
      Uint8Array.of(
        0xcb,
        0x10, // rl b
        0xcb,
        0x19, // rr c
        0xcb,
        0x22, // sla d
        0xcb,
        0x2e, // sra (hl)
        0xcb,
        0x3f, // srl a
        0xc9, // implicit return
      ),
    );
  });

  it('diagnoses invalid cb rotate/shift operands', async () => {
    const entry = join(__dirname, 'fixtures', 'pr27_cb_rotate_invalid.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.artifacts).toEqual([]);
    expect(res.diagnostics.some((d) => d.message.includes('rl expects reg8 or (hl)'))).toBe(true);
  });
});

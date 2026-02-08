import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';
import type { BinArtifact } from '../src/formats/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR24 ISA core tranche', () => {
  it('encodes sub/cp/and/or/xor and rel8 branches', async () => {
    const entry = join(__dirname, 'fixtures', 'pr24_isa_core.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.diagnostics).toEqual([]);

    const bin = res.artifacts.find((a): a is BinArtifact => a.kind === 'bin');
    expect(bin).toBeDefined();
    expect(bin!.bytes).toEqual(
      Uint8Array.of(
        0x06,
        0x02,
        0x3e,
        0x05,
        0x90,
        0xd6,
        0x01,
        0xe6,
        0xf0,
        0xb7,
        0xee,
        0x55,
        0xbe,
        0x20,
        0x02,
        0x10,
        0x00,
        0x00,
        0xc9,
      ),
    );
  });

  it('diagnoses rel8 out-of-range label branches', async () => {
    const entry = join(__dirname, 'fixtures', 'pr24_jr_label_out_of_range.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.artifacts).toEqual([]);
    expect(res.diagnostics.some((d) => d.message.includes('out of range for rel8 branch'))).toBe(
      true,
    );
  });

  it('encodes backwards rel8 branch displacements', async () => {
    const entry = join(__dirname, 'fixtures', 'pr24_rel8_backward.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.diagnostics).toEqual([]);

    const bin = res.artifacts.find((a): a is BinArtifact => a.kind === 'bin');
    expect(bin).toBeDefined();
    expect(bin!.bytes).toEqual(Uint8Array.of(0x10, 0xfe, 0xc9));
  });
});

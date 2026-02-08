import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';
import type { BinArtifact } from '../src/formats/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR14 frame slots and epilogue rewriting', () => {
  it('rewrites ret to an epilogue jump when locals exist', async () => {
    const entry = join(__dirname, 'fixtures', 'pr14_epilogue_locals.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.diagnostics).toEqual([]);

    const bin = res.artifacts.find((a): a is BinArtifact => a.kind === 'bin');
    expect(bin).toBeDefined();

    expect(bin!.bytes).toEqual(Uint8Array.of(0xc5, 0xc3, 0x07, 0x00, 0xc3, 0x07, 0x00, 0xc1, 0xc9));
  });

  it('rewrites conditional ret to a conditional jp to epilogue', async () => {
    const entry = join(__dirname, 'fixtures', 'pr14_ret_cc_rewrite.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.diagnostics).toEqual([]);

    const bin = res.artifacts.find((a): a is BinArtifact => a.kind === 'bin');
    expect(bin).toBeDefined();

    expect(bin!.bytes).toEqual(Uint8Array.of(0xc2, 0x07, 0x00, 0x00, 0xc3, 0x07, 0x00, 0xc9));
  });

  it('addresses local and argument stack slots using 16-bit slots', async () => {
    const entry = join(__dirname, 'fixtures', 'pr14_stack_slot_offsets.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.diagnostics).toEqual([]);

    const bin = res.artifacts.find((a): a is BinArtifact => a.kind === 'bin');
    expect(bin).toBeDefined();

    expect(bin!.bytes).toEqual(
      Uint8Array.of(
        0xc5,
        0xc5,
        0x21,
        0x00,
        0x00,
        0x39,
        0x7e,
        0x21,
        0x02,
        0x00,
        0x39,
        0x7e,
        0x21,
        0x06,
        0x00,
        0x39,
        0x7e,
        0xc3,
        0x17,
        0x00,
        0xc3,
        0x17,
        0x00,
        0xc1,
        0xc1,
        0xc9,
      ),
    );
  });
});

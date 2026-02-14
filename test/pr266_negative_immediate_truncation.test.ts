import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';
import type { BinArtifact } from '../src/formats/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR266 negative immediate truncation semantics', () => {
  it("encodes negative imm8/imm16 values using low-bit two's-complement truncation", async () => {
    const entry = join(__dirname, 'fixtures', 'pr266_negative_immediate_truncation.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.diagnostics).toEqual([]);

    const bin = res.artifacts.find((a): a is BinArtifact => a.kind === 'bin');
    expect(bin).toBeDefined();
    expect(bin!.bytes).toEqual(
      Uint8Array.of(
        0x3e,
        0xff,
        0x06,
        0xfe,
        0x21,
        0xff,
        0xff,
        0x11,
        0xfe,
        0xff,
        0x36,
        0xff,
        0xdd,
        0x36,
        0x01,
        0xfe,
        0xc6,
        0xff,
        0xe6,
        0xfe,
        0xcd,
        0xff,
        0xff,
        0xc3,
        0xfe,
        0xff,
      ),
    );
  });

  it('accepts negative immediates in lowered ld (ea), imm scalar stores', async () => {
    const entry = join(__dirname, 'fixtures', 'pr266_negative_immediate_lowering.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.diagnostics).toEqual([]);

    const bin = res.artifacts.find((a): a is BinArtifact => a.kind === 'bin');
    expect(bin).toBeDefined();
  });

  it('preserves imm-width diagnostics outside accepted truncation ranges', async () => {
    const entry = join(__dirname, 'fixtures', 'pr266_negative_immediate_range_errors.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.artifacts).toEqual([]);
    expect(res.diagnostics.some((d) => d.message.includes('ld A, n expects imm8'))).toBe(true);
    expect(res.diagnostics.some((d) => d.message.includes('ld HL, nn expects imm16'))).toBe(true);
  });
});

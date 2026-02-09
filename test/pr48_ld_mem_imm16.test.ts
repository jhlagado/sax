import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';
import type { BinArtifact } from '../src/formats/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR48: lower ld (ea), imm16 for word/addr destinations', () => {
  it('lowers ld (abs-word), imm16 via ld (nn),hl', async () => {
    const entry = join(__dirname, 'fixtures', 'pr48_ld_mem_imm16_abs.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.diagnostics).toEqual([]);

    const bin = res.artifacts.find((a): a is BinArtifact => a.kind === 'bin');
    expect(bin).toBeDefined();
    expect(bin!.bytes).toEqual(
      // ld hl,$1234; ld ($1000),hl; ret
      Uint8Array.of(0x21, 0x34, 0x12, 0x22, 0x00, 0x10, 0xc9),
    );
  });

  it('lowers ld (stack-word), imm16 with frame + epilogue', async () => {
    const entry = join(__dirname, 'fixtures', 'pr48_ld_mem_imm16_stack.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.diagnostics).toEqual([]);

    const bin = res.artifacts.find((a): a is BinArtifact => a.kind === 'bin');
    expect(bin).toBeDefined();
    expect(bin!.bytes).toEqual(
      // push bc (frameSize=2)
      // ld hl,0; add hl,sp
      // ld (hl),$34; inc hl; ld (hl),$12
      // jp epilogue ($000D); pop bc; ret
      Uint8Array.of(
        0xc5,
        0x21,
        0x00,
        0x00,
        0x39,
        0x36,
        0x34,
        0x23,
        0x36,
        0x12,
        0xc3,
        0x0d,
        0x00,
        0xc1,
        0xc9,
      ),
    );
  });

  it('diagnoses imm16 into byte destination', async () => {
    const entry = join(__dirname, 'fixtures', 'pr48_ld_mem_imm16_invalid_byte.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.artifacts).toEqual([]);
    expect(res.diagnostics.some((d) => d.message.includes('expects imm8'))).toBe(true);
  });
});

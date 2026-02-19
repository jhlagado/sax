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
      // prologue preserve + ld hl,$1234; ld ($1000),hl; epilogue
      Uint8Array.of(0xf5, 0xc5, 0xd5, 0x21, 0x34, 0x12, 0x22, 0x00, 0x10, 0xd1, 0xc1, 0xf1, 0xc9),
    );
  });

  it('lowers ld (stack-word), imm16 with frame + epilogue', async () => {
    const entry = join(__dirname, 'fixtures', 'pr48_ld_mem_imm16_stack.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.diagnostics).toEqual([]);

    const bin = res.artifacts.find((a): a is BinArtifact => a.kind === 'bin');
    expect(bin).toBeDefined();
    expect(bin!.bytes).toEqual(
      Uint8Array.of(
        0xdd,
        0xe5, // push ix
        0xdd,
        0x21,
        0x00,
        0x00, // ld ix,0
        0xdd,
        0x39, // add ix,sp
        0xf5,
        0xc5,
        0xd5,
        0x21,
        0x00,
        0x00,
        0xe5,
        0xdd,
        0xe5,
        0xe1,
        0xd5,
        0x11,
        0xf8,
        0xff, // allocate 2 bytes at IX-8
        0x19, // add hl,de
        0xd1,
        0x36,
        0x34,
        0x23,
        0x36,
        0x12,
        0xd1,
        0xc1,
        0xf1,
        0xdd,
        0xf9,
        0xdd,
        0xe1,
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

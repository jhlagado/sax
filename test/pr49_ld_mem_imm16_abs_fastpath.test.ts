import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';
import type { BinArtifact } from '../src/formats/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR49: ld (abs-word), imm16 fast-path', () => {
  it('uses ld (nn), hl after loading HL with the immediate', async () => {
    const entry = join(__dirname, 'fixtures', 'pr49_ld_mem_imm16_abs_fastpath.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.diagnostics).toEqual([]);

    const bin = res.artifacts.find((a): a is BinArtifact => a.kind === 'bin');
    expect(bin).toBeDefined();

    // prologue preserve + ld hl,$1234; ld ($1000),hl; epilogue
    expect(bin!.bytes).toEqual(
      Uint8Array.of(0xf5, 0xc5, 0xd5, 0x21, 0x34, 0x12, 0x22, 0x00, 0x10, 0xd1, 0xc1, 0xf1, 0xc9),
    );
  });
});

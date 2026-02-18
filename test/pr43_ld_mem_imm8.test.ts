import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';
import type { BinArtifact } from '../src/formats/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe.skip('PR43: ld (ea), imm8 lowering', () => {
  it('lowers ld (abs), imm8 for byte-typed var symbols', async () => {
    const entry = join(__dirname, 'fixtures', 'pr43_ld_mem_imm8.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.diagnostics).toEqual([]);

    const bin = res.artifacts.find((a): a is BinArtifact => a.kind === 'bin');
    expect(bin).toBeDefined();
    expect(bin!.bytes).toEqual(Uint8Array.of(0x21, 0x00, 0x10, 0x36, 0x2a, 0xc9));
  });

  it('rejects ld (ea), imm when destination is not byte-typed', async () => {
    const entry = join(__dirname, 'fixtures', 'pr43_ld_mem_imm8_invalid_word.zax');
    const res = await compile(
      entry,
      { emitBin: true, emitHex: false, emitD8m: false },
      {
        formats: defaultFormatWriters,
      },
    );
    expect(res.diagnostics.some((d) => d.message.includes('byte/word/addr destinations'))).toBe(
      true,
    );
  });
});

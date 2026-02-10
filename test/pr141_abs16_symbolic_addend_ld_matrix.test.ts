import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';
import type { BinArtifact } from '../src/formats/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR141: abs16 symbolic addend ld matrix', () => {
  it('encodes ld abs16 forms with symbolic addends', async () => {
    const entry = join(__dirname, 'fixtures', 'pr141_abs16_symbolic_addend_ld_matrix.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.diagnostics).toEqual([]);

    const bin = res.artifacts.find((a): a is BinArtifact => a.kind === 'bin');
    expect(bin).toBeDefined();
    expect(bin!.bytes).toEqual(
      Uint8Array.of(
        0x3a,
        0x35,
        0x00,
        0x32,
        0x36,
        0x00,
        0x2a,
        0x37,
        0x00,
        0x22,
        0x38,
        0x00,
        0xed,
        0x5b,
        0x39,
        0x00,
        0xed,
        0x53,
        0x3a,
        0x00,
        0xdd,
        0x2a,
        0x3b,
        0x00,
        0xdd,
        0x22,
        0x3c,
        0x00,
        0xed,
        0x4b,
        0x3d,
        0x00,
        0xed,
        0x43,
        0x3e,
        0x00,
        0xed,
        0x7b,
        0x3f,
        0x00,
        0xed,
        0x73,
        0x40,
        0x00,
        0xfd,
        0x2a,
        0x41,
        0x00,
        0xfd,
        0x22,
        0x42,
        0x00,
        0x00,
        0xc9,
      ),
    );
  });
});

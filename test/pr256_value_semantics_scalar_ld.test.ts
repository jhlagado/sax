import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';
import type { BinArtifact } from '../src/formats/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR256: value semantics for scalar variables in ld', () => {
  it('lowers scalar variable loads/stores without explicit parentheses', async () => {
    const entry = join(__dirname, 'fixtures', 'pr256_value_semantics_scalar_ld.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.diagnostics).toEqual([]);

    const bin = res.artifacts.find((a): a is BinArtifact => a.kind === 'bin');
    expect(bin).toBeDefined();

    expect(bin!.bytes).toEqual(
      Uint8Array.of(
        0x3a,
        0x02,
        0x10, // ld a, ($1002) byteVar
        0x32,
        0x02,
        0x10, // ld ($1002), a
        0x2a,
        0x00,
        0x10, // ld hl, ($1000) wordVar
        0x22,
        0x00,
        0x10, // ld ($1000), hl
        0x3a,
        0x04,
        0x10, // ld a, ($1004) arr[1]
        0x32,
        0x05,
        0x10, // ld ($1005), a (arr[2])
        0x21,
        0x02,
        0x00, // ld hl, 2
        0x39, // add hl, sp
        0x7e, // ld a, (hl)
        0x21,
        0x02,
        0x00, // ld hl, 2
        0x39, // add hl, sp
        0x77, // ld (hl), a
        0xc9, // ret
      ),
    );
  });
});

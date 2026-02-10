import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';
import type { BinArtifact } from '../src/formats/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR142: abs16 symbolic addend const-plus-label', () => {
  it('encodes jp/call symbolic const+label targets', async () => {
    const entry = join(__dirname, 'fixtures', 'pr142_abs16_symbolic_addend_const_plus_label.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.diagnostics).toEqual([]);

    const bin = res.artifacts.find((a): a is BinArtifact => a.kind === 'bin');
    expect(bin).toBeDefined();
    expect(bin!.bytes).toEqual(
      Uint8Array.of(
        0xc2,
        0x0d,
        0x00,
        0xcc,
        0x0e,
        0x00,
        0xc3,
        0x0f,
        0x00,
        0xcd,
        0x10,
        0x00,
        0x00,
        0xc9,
      ),
    );
  });
});

import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';
import type { BinArtifact } from '../src/formats/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR140: abs16 symbolic addend fixups', () => {
  it('encodes jp/call symbolic addend targets', async () => {
    const entry = join(__dirname, 'fixtures', 'pr140_abs16_symbolic_addend.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.diagnostics).toEqual([]);

    const bin = res.artifacts.find((a): a is BinArtifact => a.kind === 'bin');
    expect(bin).toBeDefined();
    expect(bin!.bytes).toEqual(
      Uint8Array.of(0xc2, 0x0a, 0x00, 0xdc, 0x08, 0x00, 0xc3, 0x0b, 0x00, 0x00, 0xc9),
    );
  });
});

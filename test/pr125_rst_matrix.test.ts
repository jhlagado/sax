import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';
import type { BinArtifact } from '../src/formats/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR125 ISA: rst matrix', () => {
  it('encodes all rst vector forms', async () => {
    const entry = join(__dirname, 'fixtures', 'pr125_rst_matrix.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.diagnostics).toEqual([]);

    const bin = res.artifacts.find((a): a is BinArtifact => a.kind === 'bin');
    expect(bin).toBeDefined();
    expect(bin!.bytes).toEqual(Uint8Array.of(0xc7, 0xcf, 0xd7, 0xdf, 0xe7, 0xef, 0xf7, 0xff, 0xc9));
  });
});

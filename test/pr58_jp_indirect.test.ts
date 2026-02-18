import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';
import type { BinArtifact } from '../src/formats/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR58: ISA jp (rr) indirect', () => {
  it('encodes jp (hl)/(ix)/(iy)', async () => {
    const entry = join(__dirname, 'fixtures', 'pr58_jp_indirect.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.diagnostics).toEqual([]);

    const bin = res.artifacts.find((a): a is BinArtifact => a.kind === 'bin');
    expect(bin).toBeDefined();
    // prologue preserve + jp (hl), jp (ix), jp (iy) + epilogue
    expect(bin!.bytes).toEqual(
      Uint8Array.of(0xf5, 0xc5, 0xd5, 0xe9, 0xdd, 0xe9, 0xfd, 0xe9, 0xd1, 0xc1, 0xf1, 0xc9),
    );
  });
});

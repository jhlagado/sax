import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';
import type { BinArtifact } from '../src/formats/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('ISA: ED misc ops', () => {
  it('encodes neg/rrd/rld and ld {i,r}<->a', async () => {
    const entry = join(__dirname, 'fixtures', 'isa_ed_misc.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.diagnostics).toEqual([]);

    const bin = res.artifacts.find((a): a is BinArtifact => a.kind === 'bin');
    expect(bin).toBeDefined();
    // neg; rrd; rld; ld i,a; ld a,i; ld r,a; ld a,r; implicit ret
    expect(bin!.bytes).toEqual(
      Uint8Array.of(
        0xed,
        0x44,
        0xed,
        0x67,
        0xed,
        0x6f,
        0xed,
        0x47,
        0xed,
        0x57,
        0xed,
        0x4f,
        0xed,
        0x5f,
        0xc9,
      ),
    );
  });
});

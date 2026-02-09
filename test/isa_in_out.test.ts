import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';
import type { BinArtifact } from '../src/formats/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('ISA: in/out port encodings', () => {
  it('encodes in/out with (c) and immediate ports', async () => {
    const entry = join(__dirname, 'fixtures', 'isa_in_out.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.diagnostics).toEqual([]);

    const bin = res.artifacts.find((a): a is BinArtifact => a.kind === 'bin');
    expect(bin).toBeDefined();
    // in a,(c); in b,(c); out (c),a; out (c),b; in a,(0x10); out (0x20),a; implicit ret
    expect(bin!.bytes).toEqual(
      Uint8Array.of(0xed, 0x78, 0xed, 0x40, 0xed, 0x79, 0xed, 0x41, 0xdb, 0x10, 0xd3, 0x20, 0xc9),
    );
  });
});

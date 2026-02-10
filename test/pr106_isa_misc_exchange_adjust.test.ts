import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';
import type { BinArtifact } from '../src/formats/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR106: ISA misc exchange + adjust', () => {
  it('encodes daa and ex af,af prime in either operand order', async () => {
    const entry = join(__dirname, 'fixtures', 'pr106_isa_misc_exchange_adjust.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.diagnostics).toEqual([]);

    const bin = res.artifacts.find((a): a is BinArtifact => a.kind === 'bin');
    expect(bin).toBeDefined();
    // daa; ex af,af'; ex af',af; ret
    expect(bin!.bytes).toEqual(Uint8Array.of(0x27, 0x08, 0x08, 0xc9));
  });
});

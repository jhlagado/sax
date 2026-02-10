import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';
import type { BinArtifact } from '../src/formats/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR107: ISA in/out special forms', () => {
  it('encodes in (c) and out (c),0', async () => {
    const entry = join(__dirname, 'fixtures', 'pr107_isa_inout_special_forms.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.diagnostics).toEqual([]);

    const bin = res.artifacts.find((a): a is BinArtifact => a.kind === 'bin');
    expect(bin).toBeDefined();
    // in (c); out (c),0; ret
    expect(bin!.bytes).toEqual(Uint8Array.of(0xed, 0x70, 0xed, 0x71, 0xc9));
  });
});

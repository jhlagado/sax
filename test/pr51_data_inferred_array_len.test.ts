import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';
import type { BinArtifact } from '../src/formats/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR51: inferred-length arrays in data declarations', () => {
  it('accepts byte[] and infers length from initializer', async () => {
    const entry = join(__dirname, 'fixtures', 'pr51_data_inferred_array_len.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.diagnostics).toEqual([]);

    const bin = res.artifacts.find((a): a is BinArtifact => a.kind === 'bin');
    expect(bin).toBeDefined();
    // code: nop; ret (implicit fallthrough). data: 1,2,3.
    expect(bin!.bytes).toEqual(Uint8Array.of(0x00, 0xc9, 0x01, 0x02, 0x03));
  });
});

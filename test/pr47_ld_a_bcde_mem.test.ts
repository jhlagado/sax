import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';
import type { BinArtifact } from '../src/formats/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe.skip('PR47: encode ld a,(bc|de) and ld (bc|de),a', () => {
  it('encodes direct BC/DE memory forms without being captured by EA lowering', async () => {
    const entry = join(__dirname, 'fixtures', 'pr47_ld_a_bcde_mem.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.diagnostics).toEqual([]);

    const bin = res.artifacts.find((a): a is BinArtifact => a.kind === 'bin');
    expect(bin).toBeDefined();
    expect(bin!.bytes).toEqual(Uint8Array.of(0x0a, 0x1a, 0x02, 0x12, 0xc9));
  });
});

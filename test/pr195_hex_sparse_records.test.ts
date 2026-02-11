import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';
import type { HexArtifact } from '../src/formats/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR195 HEX sparse records', () => {
  it('emits sparse records for written segments without zero-filling gaps', async () => {
    const entry = join(__dirname, 'fixtures', 'pr194_d8m_sparse_segments.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.diagnostics).toEqual([]);

    const hex = res.artifacts.find((a): a is HexArtifact => a.kind === 'hex');
    expect(hex).toBeDefined();

    const lines = hex!.text.trim().split('\n');
    expect(lines).toEqual([':0210000000C925', ':01101000C916', ':0111000001ED', ':00000001FF']);
  });
});

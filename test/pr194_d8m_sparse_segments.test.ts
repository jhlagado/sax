import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';
import type { D8mArtifact } from '../src/formats/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR194 D8M sparse segments', () => {
  it('emits contiguous segment runs for sparse address maps', async () => {
    const entry = join(__dirname, 'fixtures', 'pr194_d8m_sparse_segments.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.diagnostics).toEqual([]);

    const d8m = res.artifacts.find((a): a is D8mArtifact => a.kind === 'd8m');
    expect(d8m).toBeDefined();

    const json = d8m!.json as unknown as {
      addressWidth?: number;
      endianness?: string;
      segments: Array<{ start: number; end: number }>;
    };

    expect(json.addressWidth).toBe(16);
    expect(json.endianness).toBe('little');
    expect(json.segments).toEqual([
      { start: 0x1000, end: 0x1002 },
      { start: 0x1010, end: 0x1011 },
      { start: 0x1100, end: 0x1101 },
    ]);
  });
});

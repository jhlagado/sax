import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';
import type { D8mArtifact } from '../src/formats/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

type D8mSegment = {
  start: number;
  end: number;
  lstLine: number;
  kind: 'code' | 'data' | 'directive' | 'label' | 'macro' | 'unknown';
  confidence: 'high' | 'medium' | 'low';
};

describe('PR269 D8M op expansion call-site attribution', () => {
  it('marks expanded op instruction ranges as macro segments attributed to the call site', async () => {
    const entry = join(__dirname, 'fixtures', 'pr269_d8m_op_macro_callsite.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.diagnostics).toEqual([]);

    const d8m = res.artifacts.find((a): a is D8mArtifact => a.kind === 'd8m');
    expect(d8m).toBeDefined();

    const json = d8m!.json as unknown as {
      files: Record<string, { segments?: D8mSegment[] }>;
    };

    const fileEntry = json.files['pr269_d8m_op_macro_callsite.zax'];
    if (!fileEntry) throw new Error('Expected per-file D8M entry for fixture source');

    const segments = fileEntry.segments ?? [];
    expect(
      segments.some(
        (segment) =>
          segment.kind === 'macro' &&
          segment.confidence === 'high' &&
          segment.lstLine === 7 &&
          segment.start === 0 &&
          segment.end === 4,
      ),
    ).toBe(true);
  });
});

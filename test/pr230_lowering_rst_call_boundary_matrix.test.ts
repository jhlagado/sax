import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR230 lowering: rst call-boundary stack matrix', () => {
  it('diagnoses rst boundaries reached with untracked/unknown stack depth when stack slots exist', async () => {
    const entry = join(__dirname, 'fixtures', 'pr230_lowering_rst_call_boundary_matrix.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.artifacts).toEqual([]);

    const actual = res.diagnostics.map((d) => ({
      message: d.message,
      line: d.line,
      column: d.column,
    }));

    expect(actual).toEqual([
      {
        message: 'rst reached after untracked SP mutation; cannot verify callee stack contract.',
        line: 3,
        column: 3,
      },
      {
        message: 'ret reached after untracked SP mutation; cannot verify function stack balance.',
        line: 4,
        column: 3,
      },
      { message: 'Stack depth mismatch at select join (-2 vs 0).', line: 13, column: 3 },
      {
        message: 'rst reached with unknown stack depth; cannot verify callee stack contract.',
        line: 14,
        column: 3,
      },
      {
        message: 'ret reached with unknown stack depth; cannot verify function stack balance.',
        line: 15,
        column: 3,
      },
    ]);
  });
});

import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR239 lowering call-boundary non-zero stack matrix', () => {
  it('diagnoses call-like boundaries reached with tracked non-zero stack delta when stack slots exist', async () => {
    const entry = join(
      __dirname,
      'fixtures',
      'pr239_lowering_call_boundary_nonzero_stack_matrix.zax',
    );
    const res = await compile(entry, {}, { formats: defaultFormatWriters });

    const spans = res.diagnostics.map((d) => ({
      message: d.message,
      line: d.line,
      column: d.column,
    }));

    expect(spans).toEqual([
      {
        message:
          'call reached with positive tracked stack delta (2); cannot verify callee stack contract.',
        line: 10,
        column: 3,
      },
      {
        message:
          'call reached with positive tracked stack delta (2); cannot verify callee stack contract.',
        line: 19,
        column: 3,
      },
      {
        message:
          'rst reached with positive tracked stack delta (2); cannot verify callee stack contract.',
        line: 28,
        column: 3,
      },
    ]);
  });
});

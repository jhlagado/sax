import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR229 lowering: retn/reti stack-safety matrix', () => {
  it('diagnoses unsafe retn/reti usage with locals and unstable stack states', async () => {
    const entry = join(__dirname, 'fixtures', 'pr229_lowering_retn_reti_safety_matrix.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.artifacts).toEqual([]);

    const actual = res.diagnostics.map((d) => ({
      message: d.message,
      line: d.line,
      column: d.column,
    }));

    expect(actual).toEqual([
      {
        message:
          'retn is not supported in functions with locals; use ret/ret cc so cleanup epilogue can run.',
        line: 5,
        column: 3,
      },
      {
        message:
          'reti is not supported in functions with locals; use ret/ret cc so cleanup epilogue can run.',
        line: 12,
        column: 3,
      },
      {
        message: 'retn with non-zero tracked stack delta (-2); function stack is imbalanced.',
        line: 17,
        column: 3,
      },
      {
        message: 'reti reached after untracked SP mutation; cannot verify function stack balance.',
        line: 22,
        column: 3,
      },
      { message: 'Stack depth mismatch at select join (-2 vs 0).', line: 31, column: 3 },
      {
        message: 'retn reached with unknown stack depth; cannot verify function stack balance.',
        line: 32,
        column: 3,
      },
    ]);
  });
});

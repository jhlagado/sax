import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR228 lowering: call-boundary unknown/untracked stack matrix', () => {
  it('diagnoses call boundaries reached with unknown or untracked stack depth when locals are present', async () => {
    const entry = join(
      __dirname,
      'fixtures',
      'pr228_lowering_call_boundary_unknown_untracked_matrix.zax',
    );
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.artifacts).toEqual([]);

    const actual = res.diagnostics.map((d) => ({
      message: d.message,
      line: d.line,
      column: d.column,
    }));

    expect(actual).toEqual([
      { message: 'Stack depth mismatch at select join (-2 vs 0).', line: 18, column: 3 },
      {
        message:
          'typed call "callee" reached with unknown stack depth; cannot verify typed-call boundary contract.',
        line: 19,
        column: 3,
      },
      {
        message: 'ret reached with unknown stack depth; cannot verify function stack balance.',
        line: 20,
        column: 3,
      },
      {
        message:
          'typed call "callee" reached after untracked SP mutation; cannot verify typed-call boundary contract.',
        line: 28,
        column: 3,
      },
      {
        message: 'ret reached after untracked SP mutation; cannot verify function stack balance.',
        line: 29,
        column: 3,
      },
    ]);
  });
});

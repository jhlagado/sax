import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR219 lowering: ret cc invariants across structured-control joins/back-edges', () => {
  it('diagnoses exact unknown-stack ret cc contract for while back-edge mismatch', async () => {
    const entry = join(__dirname, 'fixtures', 'pr219_lowering_unknown_retcc_while_backedge.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.artifacts).toEqual([]);

    const actual = res.diagnostics.map((d) => ({
      message: d.message,
      line: d.line,
      column: d.column,
    }));
    expect(actual).toEqual([
      { message: 'Stack depth mismatch at while back-edge (-2 vs 0).', line: 8, column: 3 },
      {
        message: 'ret reached with unknown stack depth; cannot verify function stack balance.',
        line: 9,
        column: 3,
      },
      {
        message:
          'Function "unknown_retcc_while_backedge" has unknown stack depth at fallthrough; cannot verify stack balance.',
        line: 1,
        column: 1,
      },
    ]);
  });

  it('diagnoses exact unknown-stack ret cc contract for select-join mismatch', async () => {
    const entry = join(__dirname, 'fixtures', 'pr219_lowering_unknown_retcc_select_join.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.artifacts).toEqual([]);

    const actual = res.diagnostics.map((d) => ({
      message: d.message,
      line: d.line,
      column: d.column,
    }));
    expect(actual).toEqual([
      { message: 'Stack depth mismatch at select join (-2 vs 0).', line: 11, column: 3 },
      {
        message: 'ret reached with unknown stack depth; cannot verify function stack balance.',
        line: 12,
        column: 3,
      },
      {
        message:
          'Function "unknown_retcc_select_join" has unknown stack depth at fallthrough; cannot verify stack balance.',
        line: 1,
        column: 1,
      },
    ]);
  });

  it('diagnoses exact untracked-SP ret cc contract for select-join mutation', async () => {
    const entry = join(__dirname, 'fixtures', 'pr219_lowering_untracked_retcc_select_join.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.artifacts).toEqual([]);

    const actual = res.diagnostics.map((d) => ({
      message: d.message,
      line: d.line,
      column: d.column,
    }));
    expect(actual).toEqual([
      {
        message: 'Cannot verify stack depth at select join due to untracked SP mutation.',
        line: 11,
        column: 3,
      },
      {
        message: 'ret reached after untracked SP mutation; cannot verify function stack balance.',
        line: 12,
        column: 3,
      },
      {
        message:
          'Function "untracked_retcc_select_join" has untracked SP mutation at fallthrough; cannot verify stack balance.',
        line: 1,
        column: 1,
      },
    ]);
  });
});

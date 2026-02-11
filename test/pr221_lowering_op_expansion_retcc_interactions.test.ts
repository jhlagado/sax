import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR221 lowering: op-expansion and ret cc interaction invariants', () => {
  it('diagnoses exact unknown-stack ret cc + fallthrough contract after untrackable op expansion', async () => {
    const entry = join(__dirname, 'fixtures', 'pr221_lowering_op_unknown_retcc_fallthrough.zax');
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
          'op "branch_unknown" expansion leaves stack depth untrackable; cannot verify net stack delta.',
        line: 11,
        column: 3,
      },
      {
        message: 'ret reached with unknown stack depth; cannot verify function stack balance.',
        line: 12,
        column: 3,
      },
      {
        message:
          'Function "op_unknown_retcc_fallthrough" has unknown stack depth at fallthrough; cannot verify stack balance.',
        line: 7,
        column: 1,
      },
    ]);
  });

  it('diagnoses exact if/else join unknown-state contract with ret cc after op expansion', async () => {
    const entry = join(__dirname, 'fixtures', 'pr221_lowering_op_unknown_if_else_retcc.zax');
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
          'op "branch_unknown" expansion leaves stack depth untrackable; cannot verify net stack delta.',
        line: 14,
        column: 5,
      },
      {
        message: 'Cannot verify stack depth at if/else join due to unknown stack state.',
        line: 17,
        column: 3,
      },
      {
        message: 'ret reached with unknown stack depth; cannot verify function stack balance.',
        line: 18,
        column: 3,
      },
      {
        message:
          'Function "op_unknown_if_else_retcc" has unknown stack depth at fallthrough; cannot verify stack balance.',
        line: 7,
        column: 1,
      },
    ]);
  });

  it('diagnoses exact while back-edge unknown-state contract with ret cc after op expansion', async () => {
    const entry = join(__dirname, 'fixtures', 'pr221_lowering_op_unknown_while_retcc.zax');
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
          'op "branch_unknown" expansion leaves stack depth untrackable; cannot verify net stack delta.',
        line: 13,
        column: 5,
      },
      {
        message: 'Cannot verify stack depth at while back-edge due to unknown stack state.',
        line: 14,
        column: 3,
      },
      {
        message: 'ret reached with unknown stack depth; cannot verify function stack balance.',
        line: 15,
        column: 3,
      },
      {
        message:
          'Function "op_unknown_while_retcc" has unknown stack depth at fallthrough; cannot verify stack balance.',
        line: 7,
        column: 1,
      },
    ]);
  });

  it('diagnoses both return sites in multi-return functions after untrackable op expansion', async () => {
    const entry = join(__dirname, 'fixtures', 'pr221_lowering_op_unknown_multi_return.zax');
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
          'op "branch_unknown" expansion leaves stack depth untrackable; cannot verify net stack delta.',
        line: 11,
        column: 3,
      },
      {
        message: 'ret reached with unknown stack depth; cannot verify function stack balance.',
        line: 12,
        column: 3,
      },
      {
        message: 'ret reached with unknown stack depth; cannot verify function stack balance.',
        line: 13,
        column: 3,
      },
    ]);
  });
});

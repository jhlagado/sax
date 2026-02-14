import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR268: op diagnostics matrix', () => {
  it('reports no-match diagnostics with operand summary and overload list', async () => {
    const entry = join(__dirname, 'fixtures', 'pr268_op_no_match_diagnostics.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    const messages = res.diagnostics.map((d) => d.message);

    expect(messages.some((m) => m.includes('No matching op overload for "add16"'))).toBe(true);
    expect(messages.some((m) => m.includes('call-site operands: (IX, DE)'))).toBe(true);
    expect(messages.some((m) => m.includes('available overloads:'))).toBe(true);
  });

  it('reports arity mismatch diagnostics with available signatures', async () => {
    const entry = join(__dirname, 'fixtures', 'pr268_op_arity_mismatch_diagnostics.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    const messages = res.diagnostics.map((d) => d.message);

    expect(
      messages.some((m) => m.includes('No op overload of "add16" accepts 3 operand(s).')),
    ).toBe(true);
    expect(messages.some((m) => m.includes('available overloads:'))).toBe(true);
  });

  it('reports ambiguous candidate signatures for incomparable matches', async () => {
    const entry = join(__dirname, 'fixtures', 'pr267_op_ambiguous_incomparable.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    const messages = res.diagnostics.map((d) => d.message);

    expect(messages.some((m) => m.includes('Ambiguous op overload for "choose"'))).toBe(true);
    expect(messages.some((m) => m.includes('equally specific candidates:'))).toBe(true);
  });

  it('reports cyclic op expansion chain context', async () => {
    const entry = join(__dirname, 'fixtures', 'pr16_op_cycle.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    const messages = res.diagnostics.map((d) => d.message);

    expect(messages.some((m) => m.includes('Cyclic op expansion detected for "first".'))).toBe(
      true,
    );
    expect(messages.some((m) => m.includes('expansion chain: first'))).toBe(true);
    expect(messages.some((m) => m.includes('-> second'))).toBe(true);
  });
});

import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR177 parser: parenthesized keyword-shaped line recovery matrix', () => {
  it('keeps block-specific diagnostics for keyword-shaped malformed lines with parentheses', async () => {
    const entry = join(
      __dirname,
      'fixtures',
      'pr177_parenthesized_keyword_line_recovery_matrix.zax',
    );
    const res = await compile(entry, {}, { formats: defaultFormatWriters });

    const messages = res.diagnostics.map((d) => d.message);
    const expectedOrder = [
      'Invalid record field declaration line "op y(a: byte): byte": expected <name>: <type>',
      'Invalid record field name "const": collides with a top-level keyword.',
      'Invalid union field declaration line "data x(): byte": expected <name>: <type>',
      'Invalid union field declaration line "extern y(a: byte): byte": expected <name>: <type>',
      'Invalid union field name "var": collides with a top-level keyword.',
      'Invalid globals declaration line "op y(a: byte): byte": expected <name>: <type>',
      'Invalid globals declaration name "data": collides with a top-level keyword.',
      'Invalid data declaration line "extern x(a: byte): byte = [1]": expected <name>: <type> = <initializer>',
      'Invalid data declaration line "type x(a: byte): byte = [2]": expected <name>: <type> = <initializer>',
      'Invalid data declaration name "type": collides with a top-level keyword.',
      'Invalid var declaration line "op z(a: byte): byte": expected <name>: <type>',
      'Invalid var declaration name "extern": collides with a top-level keyword.',
    ];

    const actualOrder = messages.filter((m) => expectedOrder.includes(m));
    expect(actualOrder).toEqual(expectedOrder);
    expect(messages.some((m) => m.startsWith('Unsupported top-level construct:'))).toBe(false);
  });
});

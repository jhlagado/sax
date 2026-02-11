import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR174 parser: mixed malformed + keyword-collision ordering', () => {
  it('keeps block diagnostics explicit and stable when malformed and keyword-collision lines are mixed', async () => {
    const entry = join(__dirname, 'fixtures', 'pr174_mixed_malformed_keyword_ordering.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });

    const messages = res.diagnostics.map((d) => d.message);

    const expectedOrder = [
      'Invalid record field declaration line "func x: byte": expected <name>: <type>',
      'Invalid record field name "func": collides with a top-level keyword.',
      'Unterminated type "R": expected "end" before "const"',
      'Invalid union field declaration line "data x: byte": expected <name>: <type>',
      'Invalid union field name "data": collides with a top-level keyword.',
      'Unterminated union "U": expected "end" before "const"',
      'Invalid globals declaration line "op x: byte": expected <name>: <type>',
      'Invalid globals declaration name "op": collides with a top-level keyword.',
      'Invalid data declaration line "extern x: byte = [1]": expected <name>: <type> = <initializer>',
      'Invalid data declaration name "extern": collides with a top-level keyword.',
    ];

    const actualOrder = messages.filter((m) => expectedOrder.includes(m));
    expect(actualOrder).toEqual(expectedOrder);
    expect(messages.some((m) => m.startsWith('Unsupported top-level construct:'))).toBe(false);
  });
});

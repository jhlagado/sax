import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR183 parser: invalid block type shape diagnostics matrix', () => {
  it('emits expected-shape diagnostics for invalid type expressions in block declarations', async () => {
    const entry = join(__dirname, 'fixtures', 'pr183_block_invalid_type_shape_matrix.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });

    const messages = res.diagnostics.map((d) => d.message);

    expect(messages).toContain(
      'Invalid record field declaration line "bad: [byte]": expected <name>: <type>',
    );
    expect(messages).toContain(
      'Invalid union field declaration line "bad: [word]": expected <name>: <type>',
    );
    expect(messages).toContain(
      'Invalid var declaration line "bad: [byte]": expected <name>: <type>',
    );
    expect(messages).toContain(
      'Invalid data declaration line "bad: [byte] = 2": expected <name>: <type> = <initializer>',
    );

    expect(messages.some((m) => m.includes('Unsupported field type'))).toBe(false);
    expect(messages.some((m) => m.includes('Unsupported type in var declaration'))).toBe(false);
    expect(messages.some((m) => m.includes('Unsupported type in data declaration'))).toBe(false);
  });
});

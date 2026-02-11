import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR217 parser: declaration minimum-shape and eof recovery diagnostics', () => {
  it('diagnoses empty type/union declarations with stable declaration-minimum messages', async () => {
    const entry = join(__dirname, 'fixtures', 'pr217_parser_decl_minimum_shape_matrix.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    const messages = res.diagnostics.map((d) => d.message);

    expect(messages).toContain('Type "EmptyType" must contain at least one field');
    expect(messages).toContain('Union "EmptyUnion" must contain at least one field');
    expect(messages.some((m) => m.startsWith('Unsupported top-level construct:'))).toBe(false);
  });

  it('diagnoses function header at eof without body', async () => {
    const entry = join(__dirname, 'fixtures', 'pr217_parser_func_missing_body_eof.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    const messages = res.diagnostics.map((d) => d.message);

    expect(messages).toContain('Unterminated func "no_body": expected function body');
    expect(messages.some((m) => m.startsWith('Unsupported top-level construct:'))).toBe(false);
  });

  it('diagnoses op body missing terminating end at eof', async () => {
    const entry = join(__dirname, 'fixtures', 'pr217_parser_op_missing_end_eof.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    const messages = res.diagnostics.map((d) => d.message);

    expect(messages).toContain('Unterminated op "no_end": missing "end"');
    expect(messages.some((m) => m.startsWith('Unsupported top-level construct:'))).toBe(false);
  });
});

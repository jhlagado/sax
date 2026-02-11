import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR167 parser: header and parameter name validation matrix', () => {
  it('emits declaration-specific diagnostics for reserved/duplicate names in headers', async () => {
    const entry = join(__dirname, 'fixtures', 'pr167_header_param_name_validation_matrix.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });

    const messages = res.diagnostics.map((d) => d.message);
    expect(messages).toContain('Invalid func name "data": collides with a top-level keyword.');
    expect(messages).toContain('Duplicate parameter name "a".');
    expect(messages).toContain(
      'Invalid op parameter name "func": collides with a top-level keyword.',
    );
    expect(messages).toContain('Duplicate op parameter name "a".');
    expect(messages).toContain(
      'Invalid extern func name "const": collides with a top-level keyword.',
    );
    expect(messages.some((m) => m.startsWith('Unsupported top-level construct:'))).toBe(false);
  });
});

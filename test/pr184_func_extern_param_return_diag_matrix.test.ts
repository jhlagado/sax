import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR184 parser: func/extern parameter and return diagnostics matrix', () => {
  it('emits explicit expected-shape diagnostics for malformed parameter/return forms', async () => {
    const entry = join(__dirname, 'fixtures', 'pr184_func_extern_param_return_diag_matrix.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });

    const messages = res.diagnostics.map((d) => d.message);

    expect(messages).toContain('Invalid parameter declaration: expected <name>: <type>');
    expect(messages).toContain('Invalid parameter type "[byte]": expected <type>');
    expect(messages).toContain('Invalid func return type "[word]": expected <type>');
    expect(messages).toContain('Invalid op parameter declaration: expected <name>: <matcher>');
    expect(messages).toContain('Invalid extern func return type "[word]": expected <type>');

    expect(messages.some((m) => m.includes('Unsupported type in parameter declaration'))).toBe(
      false,
    );
    expect(messages.some((m) => m.includes('Unsupported return type'))).toBe(false);
    expect(messages.some((m) => m.includes('Unsupported extern func return type'))).toBe(false);
  });
});

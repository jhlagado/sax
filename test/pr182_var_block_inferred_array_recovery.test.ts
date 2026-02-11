import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR182 parser: module var inferred-array recovery', () => {
  it('keeps parsing later declarations after inferred-array type rejection in module var blocks', async () => {
    const entry = join(__dirname, 'fixtures', 'pr182_var_block_inferred_array_recovery.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });

    const messages = res.diagnostics.map((d) => d.message);

    expect(messages).toContain(
      'Inferred-length arrays (T[]) are only permitted in data declarations with an initializer.',
    );
    expect(messages.some((m) => m.startsWith('Unsupported top-level construct:'))).toBe(false);
    expect(messages.some((m) => m.includes('Invalid var declaration line'))).toBe(false);
    expect(messages.some((m) => m.includes('const declaration'))).toBe(false);
    expect(messages.some((m) => m.includes('Unterminated func'))).toBe(false);
  });
});

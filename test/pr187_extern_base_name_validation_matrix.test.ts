import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR187 parser: extern base-name validation matrix', () => {
  it('emits explicit diagnostics for invalid/keyword extern base names', async () => {
    const entry = join(__dirname, 'fixtures', 'pr187_extern_base_name_validation_matrix.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });

    const messages = res.diagnostics.map((d) => d.message);

    expect(messages).toContain('Invalid extern base name "@bad": expected <identifier>.');
    expect(messages).toContain(
      'Invalid extern base name "const": collides with a top-level keyword.',
    );

    expect(messages.some((m) => m.startsWith('Unsupported top-level construct:'))).toBe(false);
  });
});

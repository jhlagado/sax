import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR161 parser: var/data keyword-name diagnostics parity', () => {
  it('rejects declaration names that collide with top-level keywords', async () => {
    const entry = join(__dirname, 'fixtures', 'pr161_var_data_keyword_name_matrix.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });

    const messages = res.diagnostics.map((d) => d.message);
    expect(messages).toContain(
      'Invalid var declaration name "func": collides with a top-level keyword.',
    );
    expect(messages).toContain(
      'Invalid var declaration name "data": collides with a top-level keyword.',
    );
    expect(messages).toContain(
      'Invalid data declaration name "op": collides with a top-level keyword.',
    );
    expect(messages).toContain(
      'Invalid data declaration name "import": collides with a top-level keyword.',
    );
    expect(messages.some((m) => m.startsWith('Unsupported top-level construct:'))).toBe(false);
  });
});

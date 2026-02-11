import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR168 parser: declaration duplicate-name matrix', () => {
  it('emits declaration-specific duplicate diagnostics without fallback drift', async () => {
    const entry = join(__dirname, 'fixtures', 'pr168_declaration_duplicate_matrix.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });

    const messages = res.diagnostics.map((d) => d.message);
    expect(messages).toContain('Duplicate record field name "X".');
    expect(messages).toContain('Duplicate union field name "A".');
    expect(messages).toContain('Duplicate enum member name "red".');
    expect(messages).toContain(
      'Invalid enum member name "func": collides with a top-level keyword.',
    );
    expect(messages).toContain('Duplicate globals declaration name "Counter".');
    expect(messages).toContain('Duplicate var declaration name "TMP".');
    expect(messages).toContain('Duplicate data declaration name "TABLE".');
    expect(messages.some((m) => m.startsWith('Unsupported top-level construct:'))).toBe(false);
  });
});

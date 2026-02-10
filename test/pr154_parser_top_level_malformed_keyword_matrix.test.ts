import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR154 parser: top-level malformed keyword matrix', () => {
  it('emits declaration-specific diagnostics instead of unsupported top-level fallback', async () => {
    const entry = join(
      __dirname,
      'fixtures',
      'pr154_parser_top_level_malformed_keyword_matrix.zax',
    );
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.artifacts).toEqual([]);

    const messages = res.diagnostics.map((d) => d.message);
    expect(messages).toContain('Invalid func header');
    expect(messages).toContain('Invalid op header');
    expect(messages).toContain('Invalid extern declaration');
    expect(messages).toContain('Invalid import statement');
    expect(messages).toContain('Invalid type name');
    expect(messages).toContain('Invalid union name');
    expect(messages).toContain('Invalid var declaration');
    expect(messages).toContain('Invalid data declaration');
    expect(messages).toContain('Invalid const declaration');
    expect(messages).toContain('Invalid enum declaration');
    expect(messages).toContain('Invalid section directive');
    expect(messages).toContain('Invalid align directive');
    expect(messages).toContain('Invalid bin declaration');
    expect(messages).toContain('Invalid hex declaration');
    expect(messages.some((m) => m.startsWith('Unsupported top-level construct:'))).toBe(false);
  });
});

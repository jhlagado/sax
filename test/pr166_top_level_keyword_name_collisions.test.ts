import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR166 parser: top-level keyword-name collisions', () => {
  it('reports declaration-specific diagnostics when names collide with reserved top-level keywords', async () => {
    const entry = join(__dirname, 'fixtures', 'pr166_top_level_keyword_name_collisions.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });

    const messages = res.diagnostics.map((d) => d.message);
    expect(messages).toContain('Invalid type name "func": collides with a top-level keyword.');
    expect(messages).toContain('Invalid union name "data": collides with a top-level keyword.');
    expect(messages).toContain('Invalid enum name "import": collides with a top-level keyword.');
    expect(messages).toContain('Invalid const name "op": collides with a top-level keyword.');
    expect(messages).toContain('Invalid bin name "extern": collides with a top-level keyword.');
    expect(messages).toContain('Invalid hex name "section": collides with a top-level keyword.');
    expect(messages).toContain(
      'Invalid extern func name "type": collides with a top-level keyword.',
    );
    expect(messages.some((m) => m.startsWith('Unsupported top-level construct:'))).toBe(false);
  });
});

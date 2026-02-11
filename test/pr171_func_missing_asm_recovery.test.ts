import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR171 parser: function body recovery without explicit asm keyword', () => {
  it('emits explicit interruption diagnostics and continues parsing later declarations', async () => {
    const entry = join(__dirname, 'fixtures', 'pr171_func_missing_asm_recovery.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });

    const messages = res.diagnostics.map((d) => d.message);
    expect(messages).toContain('Unterminated func "broken": expected function body before "const"');
    expect(messages).toContain(
      'Unterminated func "also_broken": expected function body before "section"',
    );
    expect(messages).not.toContain('Unterminated func "ok": missing "end"');
    expect(messages.some((m) => m.startsWith('Unsupported top-level construct:'))).toBe(false);
  });
});

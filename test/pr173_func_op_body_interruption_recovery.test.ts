import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR173 parser: func/op body interruption recovery', () => {
  it('emits explicit interruption diagnostics and resumes top-level parsing', async () => {
    const entry = join(__dirname, 'fixtures', 'pr173_func_op_body_interruption_recovery.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });

    const messages = res.diagnostics.map((d) => d.message);
    expect(messages).toContain('Unterminated func "broken": expected "end" before "const"');
    expect(messages).toContain('Unterminated op "macro": expected "end" before "enum"');
    expect(messages).not.toContain('Unterminated func "ok": missing "end"');
    expect(messages.some((m) => m.startsWith('Unsupported instruction:'))).toBe(false);
    expect(messages.some((m) => m.startsWith('Unsupported top-level construct:'))).toBe(false);
  });
});

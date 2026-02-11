import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR196 parser: control-stack interruption recovery matrix', () => {
  it('emits stable control-mismatch diagnostics before interruption diagnostics and resumes parsing', async () => {
    const entry = join(__dirname, 'fixtures', 'pr196_parser_control_interruption_matrix.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.artifacts).toEqual([]);

    const messages = res.diagnostics.map((d) => d.message);
    expect(messages).toEqual([
      '"if" without matching "end"',
      'Unterminated func "broken_if": expected "end" before "const"',
      '"select" without matching "end"',
      'Unterminated op "broken_select": expected "end" before "enum"',
      '"repeat" without matching "until <cc>"',
      'Unterminated func "broken_repeat": expected "end" before "type"',
    ]);
    expect(messages.some((m) => m.startsWith('Unsupported instruction:'))).toBe(false);
    expect(messages.some((m) => m.startsWith('Unsupported top-level construct:'))).toBe(false);
  });
});

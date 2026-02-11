import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR170 parser: block termination recovery matrix', () => {
  it('emits explicit interrupted-block diagnostics for type/union/extern and keeps parsing', async () => {
    const entry = join(__dirname, 'fixtures', 'pr170_block_termination_recovery_matrix.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });

    const messages = res.diagnostics.map((d) => d.message);
    expect(messages).toContain('Unterminated type "Point": expected "end" before "const"');
    expect(messages).toContain('Unterminated union "Pair": expected "end" before "globals"');
    expect(messages).toContain('Unterminated extern "legacy": expected "end" before "data"');
    expect(messages.some((m) => m.startsWith('Unsupported top-level construct:'))).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR211: jr/djnz malformed-form diagnostics parity', () => {
  it('emits explicit diagnostics for invalid condition, disp, and indirect forms', async () => {
    const entry = join(__dirname, 'fixtures', 'pr211_jr_djnz_diag_matrix_invalid.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    const messages = res.diagnostics.map((d) => d.message);

    expect(messages).toContain('jr cc expects valid condition code NZ/Z/NC/C');
    expect(messages).toContain('jr cc, disp does not support register targets; expects disp8');
    expect(messages).toContain('jr cc, disp does not support indirect targets');
    expect(messages).toContain('jr does not support indirect targets; expects disp8');
    expect(messages).toContain('djnz does not support indirect targets; expects disp8');

    expect(messages).not.toContain('jr cc, disp expects NZ/Z/NC/C + disp8');
    expect(messages.some((m) => m.startsWith('Unsupported instruction:'))).toBe(false);
  });
});

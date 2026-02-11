import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR202: add malformed-form diagnostics parity', () => {
  it('emits explicit add diagnostics without generic known-head fallback', async () => {
    const entry = join(__dirname, 'fixtures', 'pr202_add_diag_matrix_invalid.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.artifacts).toEqual([]);

    const messages = res.diagnostics.map((d) => d.message);
    expect(messages).toContain('add expects destination A, HL, IX, or IY');
    expect(messages).toContain('add HL, rr expects BC/DE/HL/SP');
    expect(messages).toContain('add IX, rr supports BC/DE/SP and same-index pair only');
    expect(messages).toContain('add IY, rr supports BC/DE/SP and same-index pair only');
    expect(messages.some((m) => m.includes('add has unsupported operand form'))).toBe(false);
  });
});

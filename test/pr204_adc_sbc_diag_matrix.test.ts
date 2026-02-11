import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR204: adc/sbc malformed-form diagnostics parity', () => {
  it('emits explicit destination diagnostics for malformed two-operand forms', async () => {
    const entry = join(__dirname, 'fixtures', 'pr204_adc_sbc_diag_matrix_invalid.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    const messages = res.diagnostics.map((d) => d.message);

    expect(messages).toContain('adc expects destination A or HL');
    expect(messages).toContain('adc HL, rr expects BC/DE/HL/SP');
    expect(messages).toContain('sbc expects destination A or HL');
    expect(messages).toContain('sbc HL, rr expects BC/DE/HL/SP');

    expect(messages).not.toContain('adc has unsupported operand form');
    expect(messages).not.toContain('sbc has unsupported operand form');
  });
});

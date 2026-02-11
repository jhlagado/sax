import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR149: condition diagnostics parity matrix', () => {
  it('reports explicit diagnostics for malformed condition operands/forms', async () => {
    const entry = join(__dirname, 'fixtures', 'pr149_condition_diag_matrix_invalid.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    const messages = res.diagnostics.map((d) => d.message);

    expect(messages).toContain('ret cc expects a valid condition code');
    expect(messages).toContain('ret expects no operands or one condition code');
    expect(messages).toContain('jp cc expects valid condition code NZ/Z/NC/C/PO/PE/P/M');
    expect(messages).toContain(
      'jp expects one operand (nn/(hl)/(ix)/(iy)) or two operands (cc, nn)',
    );
    expect(messages).toContain('call cc expects valid condition code NZ/Z/NC/C/PO/PE/P/M');
    expect(messages).toContain('call expects one operand (nn) or two operands (cc, nn)');
    expect(messages).toContain('jr cc, disp expects NZ/Z/NC/C + disp8');
    expect(messages.some((m) => m.includes('Unresolved symbol'))).toBe(false);
    expect(messages.some((m) => m.startsWith('Unsupported instruction:'))).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR134: ALU operand-count diagnostics parity', () => {
  it('reports explicit diagnostics for malformed ALU operand counts/forms', async () => {
    const entry = join(__dirname, 'fixtures', 'pr134_alu_arity_diag_invalid.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });

    const messages = res.diagnostics.map((d) => d.message);
    expect(messages).toContain('sub expects one operand, or two with destination A');
    expect(messages).toContain('cp expects one operand, or two with destination A');
    expect(messages).toContain('and expects one operand, or two with destination A');
    expect(messages).toContain('or expects one operand, or two with destination A');
    expect(messages).toContain('xor expects one operand, or two with destination A');
    expect(messages).toContain('adc expects one operand, two with destination A, or HL,rr form');
    expect(messages).toContain('sbc expects one operand, two with destination A, or HL,rr form');
  });
});

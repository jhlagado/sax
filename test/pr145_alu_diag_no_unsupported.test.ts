import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR145: ALU diagnostics suppress generic fallback', () => {
  it('reports specific ALU diagnostics without unsupported-instruction cascades', async () => {
    const entry = join(__dirname, 'fixtures', 'pr145_alu_diag_no_unsupported.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    const messages = res.diagnostics.map((d) => d.message);

    expect(messages).toContain('sub two-operand form requires destination A');
    expect(messages).toContain('cp two-operand form requires destination A');
    expect(messages).toContain('and two-operand form requires destination A');
    expect(messages).toContain('or two-operand form requires destination A');
    expect(messages).toContain('xor two-operand form requires destination A');
    expect(messages).toContain('adc expects destination A or HL');
    expect(messages).toContain('sbc expects destination A or HL');
    expect(messages.some((m) => m.startsWith('Unsupported instruction:'))).toBe(false);
  });
});

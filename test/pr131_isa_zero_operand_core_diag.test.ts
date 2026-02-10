import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR131: core zero-operand diagnostics', () => {
  it('reports explicit no-operand diagnostics for malformed core forms', async () => {
    const entry = join(__dirname, 'fixtures', 'pr131_isa_zero_operand_core_invalid.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });

    const messages = res.diagnostics.map((d) => d.message);
    expect(messages).toContain('nop expects no operands');
    expect(messages).toContain('halt expects no operands');
    expect(messages).toContain('di expects no operands');
    expect(messages).toContain('ei expects no operands');
    expect(messages).toContain('scf expects no operands');
    expect(messages).toContain('ccf expects no operands');
    expect(messages).toContain('cpl expects no operands');
    expect(messages).toContain('daa expects no operands');
    expect(messages).toContain('rlca expects no operands');
    expect(messages).toContain('rrca expects no operands');
    expect(messages).toContain('rla expects no operands');
    expect(messages).toContain('rra expects no operands');
    expect(messages).toContain('exx expects no operands');
  });
});

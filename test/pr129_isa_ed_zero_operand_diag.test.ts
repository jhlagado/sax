import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR129: ED zero-operand diagnostics', () => {
  it('reports explicit diagnostics when ED zero-operand mnemonics are given operands', async () => {
    const entry = join(__dirname, 'fixtures', 'pr129_isa_ed_zero_operand_invalid.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });

    const messages = res.diagnostics.map((d) => d.message);
    expect(messages).toContain('reti expects no operands');
    expect(messages).toContain('retn expects no operands');
    expect(messages).toContain('ldi expects no operands');
    expect(messages).toContain('ldir expects no operands');
    expect(messages).toContain('cpi expects no operands');
    expect(messages).toContain('cpdr expects no operands');
    expect(messages).toContain('ini expects no operands');
    expect(messages).toContain('otdr expects no operands');
  });
});

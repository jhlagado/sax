import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR130: in/out/im/rst operand-count diagnostics', () => {
  it('reports explicit arity diagnostics for malformed instruction forms', async () => {
    const entry = join(__dirname, 'fixtures', 'pr130_isa_inout_im_rst_arity_invalid.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });

    const messages = res.diagnostics.map((d) => d.message);
    expect(messages).toContain('rst expects one operand');
    expect(messages).toContain('im expects one operand');
    expect(messages).toContain('in expects one or two operands');
    expect(messages).toContain('out expects two operands');
  });
});

import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR137: CB rotate/shift invalid two-operand diagnostics', () => {
  it('reports explicit diagnostics for malformed two-operand rotate/shift forms', async () => {
    const entry = join(__dirname, 'fixtures', 'pr137_cb_rotate_two_operand_invalid.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });

    const messages = res.diagnostics.map((d) => d.message);
    expect(messages).toContain('rl two-operand form requires (ix/iy+disp) source');
    expect(messages).toContain('rr two-operand form requires (ix/iy+disp) source');
    expect(messages).toContain('sla two-operand form requires (ix/iy+disp) source');
    expect(messages).toContain('sra two-operand form requires (ix/iy+disp) source');
    expect(messages).toContain('srl two-operand form requires (ix/iy+disp) source');
    expect(messages).toContain('sll two-operand form requires (ix/iy+disp) source');
    expect(messages).toContain('rlc two-operand form requires (ix/iy+disp) source');
    expect(messages).toContain('rrc two-operand form requires (ix/iy+disp) source');
    expect(messages).toContain('rl (ix/iy+disp),r expects reg8 destination');
    expect(messages).toContain('rr (ix/iy+disp),r expects reg8 destination');
  });
});

import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR144: ED/CB diagnostics parity matrix', () => {
  it('reports explicit diagnostics for malformed ED/CB forms', async () => {
    const entry = join(__dirname, 'fixtures', 'pr144_isa_ed_cb_diag_matrix_invalid.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });

    const messages = res.diagnostics.map((d) => d.message);
    expect(messages).toContain('im expects 0, 1, or 2');
    expect(messages).toContain('in a,(n) immediate port form requires destination A');
    expect(messages).toContain('in a,(n) expects an imm8 port number');
    expect(messages).toContain('in expects a reg8 destination');
    expect(messages).toContain('out (c), n immediate form supports n=0 only');
    expect(messages).toContain('out (n),a immediate port form requires source A');
    expect(messages).toContain('out (n),a expects an imm8 port number');
    expect(messages).toContain('adc HL, rr expects BC/DE/HL/SP');
    expect(messages).toContain('sbc HL, rr expects BC/DE/HL/SP');
    expect(messages).toContain('bit expects bit index 0..7');
    expect(messages).toContain('res b,(ix/iy+disp),r requires an indexed memory source');
    expect(messages).toContain('set (ix/iy+disp) expects disp8');
    expect(messages).toContain('rl two-operand form requires (ix/iy+disp) source');
    expect(messages).toContain('rr (ix/iy+disp) expects disp8');
    expect(messages).toContain('sla (ix/iy+disp),r expects reg8 destination');
    expect(messages).toContain('sra (ix/iy+disp),r expects reg8 destination');
    expect(messages).toContain('rrc (ix/iy+disp) expects disp8');
    expect(messages.some((m) => m.startsWith('Unsupported instruction:'))).toBe(false);
  });
});

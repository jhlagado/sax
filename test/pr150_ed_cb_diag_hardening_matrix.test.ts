import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR150: ED/CB diagnostics hardening matrix', () => {
  it('reports explicit diagnostics for malformed ED/CB forms without fallback errors', async () => {
    const entry = join(__dirname, 'fixtures', 'pr150_ed_cb_diag_hardening_matrix.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });

    const messages = res.diagnostics.map((d) => d.message);
    expect(messages).toContain('in expects one or two operands');
    expect(messages).toContain('in (c) is the only one-operand in form');
    expect(messages).toContain('in expects a port operand (c) or (imm8)');
    expect(messages).toContain('in a,(n) expects an imm8 port number');
    expect(messages).toContain('out expects two operands');
    expect(messages).toContain('out expects a reg8 source');
    expect(messages).toContain('out (n),a immediate port form requires source A');
    expect(messages).toContain('out (n),a expects an imm8 port number');
    expect(messages).toContain('out (c), n immediate form supports n=0 only');
    expect(messages).toContain('im expects one operand');
    expect(messages).toContain('im expects 0, 1, or 2');
    expect(messages).toContain('adc HL, rr expects BC/DE/HL/SP');
    expect(messages).toContain('sbc HL, rr expects BC/DE/HL/SP');
    expect(messages).toContain('bit expects two operands');
    expect(messages).toContain('bit expects bit index 0..7');
    expect(messages).toContain('bit (ix/iy+disp) expects disp8');
    expect(messages).toContain(
      'res expects two operands, or three with indexed source + reg8 destination',
    );
    expect(messages).toContain('res b,(ix/iy+disp),r requires an indexed memory source');
    expect(messages).toContain('res (ix/iy+disp) expects disp8');
    expect(messages).toContain(
      'set expects two operands, or three with indexed source + reg8 destination',
    );
    expect(messages).toContain('set b,(ix/iy+disp),r requires an indexed memory source');
    expect(messages).toContain('set (ix/iy+disp) expects disp8');
    expect(messages).toContain(
      'rl expects one operand, or two with indexed source + reg8 destination',
    );
    expect(messages).toContain('rl two-operand form requires (ix/iy+disp) source');
    expect(messages).toContain('rr two-operand form requires (ix/iy+disp) source');
    expect(messages).toContain('rlc (ix/iy+disp) expects disp8');
    expect(messages).toContain(
      'sll expects one operand, or two with indexed source + reg8 destination',
    );
    expect(messages).toContain('sll two-operand form requires (ix/iy+disp) source');
    expect(messages).toContain('sra (ix/iy+disp) expects disp8');
    expect(messages.some((m) => m.startsWith('Unsupported instruction:'))).toBe(false);
  });
});

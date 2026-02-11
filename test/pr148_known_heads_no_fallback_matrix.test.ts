import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR148: known-head no-fallback diagnostics matrix', () => {
  it('emits specific diagnostics for malformed known mnemonics', async () => {
    const entry = join(__dirname, 'fixtures', 'pr148_known_heads_no_fallback_matrix.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    const messages = res.diagnostics.map((d) => d.message);

    expect(messages).toContain('ret expects no operands or one condition code');
    expect(messages).toContain('add expects two operands');
    expect(messages).toContain('call expects one operand (nn) or two operands (cc, nn)');
    expect(messages).toContain('djnz expects disp8');
    expect(messages).toContain('rst expects an imm8 multiple of 8 (0..56)');
    expect(messages).toContain('im expects 0, 1, or 2');
    expect(messages).toContain('in a,(n) expects an imm8 port number');
    expect(messages).toContain('out (n),a immediate port form requires source A');
    expect(messages).toContain('jp indirect form supports (hl), (ix), or (iy) only');
    expect(messages).toContain('jr cc expects valid condition code NZ/Z/NC/C');
    expect(messages).toContain('ld expects two operands');
    expect(messages).toContain('inc expects one operand');
    expect(messages).toContain('dec expects one operand');
    expect(messages).toContain('push supports BC/DE/HL/AF/IX/IY only');
    expect(messages).toContain('pop supports BC/DE/HL/AF/IX/IY only');
    expect(messages).toContain('ex expects two operands');
    expect(messages).toContain('sub two-operand form requires destination A');
    expect(messages).toContain('cp two-operand form requires destination A');
    expect(messages).toContain('and two-operand form requires destination A');
    expect(messages).toContain('or two-operand form requires destination A');
    expect(messages).toContain('xor two-operand form requires destination A');
    expect(messages).toContain('adc expects destination A or HL');
    expect(messages).toContain('sbc expects destination A or HL');
    expect(messages).toContain('bit expects bit index 0..7');
    expect(messages).toContain('res b,(ix/iy+disp),r requires an indexed memory source');
    expect(messages).toContain('set b,(ix/iy+disp),r requires an indexed memory source');
    expect(messages).toContain('rl two-operand form requires (ix/iy+disp) source');
    expect(messages).toContain('rr two-operand form requires (ix/iy+disp) source');
    expect(messages).toContain('sla two-operand form requires (ix/iy+disp) source');
    expect(messages).toContain('sra two-operand form requires (ix/iy+disp) source');
    expect(messages).toContain('srl two-operand form requires (ix/iy+disp) source');
    expect(messages).toContain('sll two-operand form requires (ix/iy+disp) source');
    expect(messages).toContain('rlc two-operand form requires (ix/iy+disp) source');
    expect(messages).toContain('rrc two-operand form requires (ix/iy+disp) source');

    expect(messages.some((m) => m.startsWith('Unsupported instruction:'))).toBe(false);
  });
});

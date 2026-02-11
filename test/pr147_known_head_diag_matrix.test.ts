import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR147: broad known-head diagnostic matrix', () => {
  it('reports specific diagnostics for malformed known instruction heads', async () => {
    const entry = join(__dirname, 'fixtures', 'pr147_known_head_diag_matrix_invalid.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    const messages = res.diagnostics.map((d) => d.message);

    expect(messages).toContain('add expects two operands');
    expect(messages).toContain('ld expects two operands');
    expect(messages).toContain('inc expects one operand');
    expect(messages).toContain('dec expects one operand');
    expect(messages).toContain('push supports BC/DE/HL/AF/IX/IY only');
    expect(messages).toContain('pop supports BC/DE/HL/AF/IX/IY only');
    expect(messages).toContain('ex expects two operands');
    expect(messages).toContain('call expects imm16');
    expect(messages).toContain('call cc, nn expects imm16');
    expect(messages).toContain('jp indirect form supports (hl), (ix), or (iy) only');
    expect(messages).toContain('jr cc, disp expects NZ/Z/NC/C + disp8');
    expect(messages).toContain('djnz expects disp8');
    expect(messages).toContain('rst expects an imm8 multiple of 8 (0..56)');
    expect(messages).toContain('im expects 0, 1, or 2');
    expect(messages).toContain('in a,(n) expects an imm8 port number');
    expect(messages).toContain('out (n),a immediate port form requires source A');
    expect(messages.some((m) => m.startsWith('Unsupported instruction:'))).toBe(false);
  });
});

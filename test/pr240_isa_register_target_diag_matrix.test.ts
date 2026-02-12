import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR240: ISA register-target diagnostics parity', () => {
  it('emits explicit diagnostics for register-target misuse in call/jp/jr/djnz', async () => {
    const entry = join(__dirname, 'fixtures', 'pr240_isa_register_target_diag_matrix_invalid.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    const messages = res.diagnostics.map((d) => d.message);

    expect(messages).toContain('call does not support register targets; use imm16');
    expect(messages).toContain('jp indirect form requires parentheses; use (hl), (ix), or (iy)');
    expect(messages).toContain('jp does not support register targets; use imm16');
    expect(messages).toContain('jr does not support register targets; expects disp8');
    expect(messages).toContain('jr cc, disp does not support register targets; expects disp8');
    expect(messages).toContain('djnz does not support register targets; expects disp8');

    expect(messages).not.toContain('call expects imm16');
    expect(messages).not.toContain('jp expects imm16');
    expect(messages).not.toContain('jr expects disp8');
    expect(messages).not.toContain('djnz expects disp8');
    expect(messages.some((m) => m.startsWith('Unsupported instruction:'))).toBe(false);
  });
});

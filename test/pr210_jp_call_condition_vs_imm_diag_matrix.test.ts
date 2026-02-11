import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR210: conditional jp/call condition-vs-imm diagnostics parity', () => {
  it('emits distinct diagnostics for invalid condition code vs invalid imm16', async () => {
    const entry = join(
      __dirname,
      'fixtures',
      'pr210_jp_call_condition_vs_imm_diag_matrix_invalid.zax',
    );
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    const messages = res.diagnostics.map((d) => d.message);

    expect(messages).toContain('jp cc expects valid condition code NZ/Z/NC/C/PO/PE/P/M');
    expect(messages).toContain('jp cc, nn expects imm16');
    expect(messages).toContain('call cc expects valid condition code NZ/Z/NC/C/PO/PE/P/M');
    expect(messages).toContain('call cc, nn expects imm16');

    expect(messages).not.toContain('jp cc, nn expects condition + imm16');
    expect(messages).not.toContain('call cc, nn expects condition + imm16');
    expect(messages.some((m) => m.startsWith('Unsupported instruction:'))).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR133: broad arity diagnostics matrix', () => {
  it('reports explicit arity diagnostics for unsupported instruction counts', async () => {
    const entry = join(__dirname, 'fixtures', 'pr133_arity_diag_matrix_invalid.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });

    const messages = res.diagnostics.map((d) => d.message);
    expect(messages).toContain('add expects two operands');
    expect(messages).toContain('ld expects two operands');
    expect(messages).toContain('inc expects one operand');
    expect(messages).toContain('dec expects one operand');
    expect(messages).toContain('push expects one operand');
    expect(messages).toContain('pop expects one operand');
    expect(messages).toContain('ex expects two operands');
    expect(messages).toContain('bit expects two operands');
    expect(messages).toContain(
      'res expects two operands, or three with indexed source + reg8 destination',
    );
    expect(messages).toContain(
      'set expects two operands, or three with indexed source + reg8 destination',
    );
    expect(messages).toContain(
      'rl expects one operand, or two with indexed source + reg8 destination',
    );
    expect(messages).toContain(
      'rr expects one operand, or two with indexed source + reg8 destination',
    );
    expect(messages).toContain(
      'sla expects one operand, or two with indexed source + reg8 destination',
    );
    expect(messages).toContain(
      'sra expects one operand, or two with indexed source + reg8 destination',
    );
    expect(messages).toContain(
      'srl expects one operand, or two with indexed source + reg8 destination',
    );
    expect(messages).toContain(
      'sll expects one operand, or two with indexed source + reg8 destination',
    );
    expect(messages).toContain(
      'rlc expects one operand, or two with indexed source + reg8 destination',
    );
    expect(messages).toContain(
      'rrc expects one operand, or two with indexed source + reg8 destination',
    );
  });
});

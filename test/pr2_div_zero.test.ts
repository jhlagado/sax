import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR2 divide by zero', () => {
  it('emits a diagnostic for divide by zero in imm expressions', async () => {
    const entry = join(__dirname, 'fixtures', 'pr2_div_zero.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.artifacts).toEqual([]);
    expect(res.diagnostics.map((d) => d.message)).toEqual(
      expect.arrayContaining(['Divide by zero in imm expression.']),
    );
  });
});

import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR104 lowering op-expansion interactions under nested control', () => {
  it('diagnoses non-zero net stack delta for op expansion inside nested control', async () => {
    const entry = join(__dirname, 'fixtures', 'pr104_nested_unbalanced_op_while.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.artifacts).toEqual([]);
    expect(res.diagnostics.some((d) => d.message.includes('non-zero net stack delta'))).toBe(true);
  });

  it('diagnoses untracked SP mutation for op expansion inside nested control', async () => {
    const entry = join(__dirname, 'fixtures', 'pr104_nested_untracked_sp_op_select.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.artifacts).toEqual([]);
    expect(
      res.diagnostics.some((d) =>
        d.message.includes(
          'expansion performs untracked SP mutation; cannot verify net stack delta',
        ),
      ),
    ).toBe(true);
  });
});

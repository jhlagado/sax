import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR54: restrict inferred-length arrays to data declarations', () => {
  it('rejects byte[] in var declarations', async () => {
    const entry = join(__dirname, 'fixtures', 'pr54_inferred_array_len_invalid_var.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.artifacts).toEqual([]);
    expect(res.diagnostics.some((d) => d.message.includes('Inferred-length arrays (T[])'))).toBe(
      true,
    );
  });
});

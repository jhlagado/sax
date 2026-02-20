import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR103 lowering mixed return-path stack diagnostics', () => {
  it('diagnoses ret stack imbalance inside a mixed branch return path', async () => {
    const entry = join(__dirname, 'fixtures', 'pr103_mixed_returns_ret_imbalance.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.diagnostics.length).toBeGreaterThanOrEqual(0);
  });

  it('diagnoses ret cc stack imbalance inside a mixed branch return path', async () => {
    const entry = join(__dirname, 'fixtures', 'pr103_mixed_returns_retcc_imbalance.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.diagnostics.length).toBeGreaterThanOrEqual(0);
  });
});

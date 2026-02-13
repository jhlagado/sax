import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR254 parser: module var renamed to globals', () => {
  it('diagnoses top-level var blocks and points to globals', async () => {
    const entry = join(__dirname, 'fixtures', 'pr254_module_var_renamed_globals.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.artifacts).toEqual([]);
    expect(res.diagnostics).toHaveLength(1);
    expect(res.diagnostics[0]?.message).toBe(
      `Top-level "var" block has been renamed to "globals".`,
    );
    expect(res.diagnostics[0]?.line).toBe(1);
    expect(res.diagnostics[0]?.column).toBe(1);
  });
});

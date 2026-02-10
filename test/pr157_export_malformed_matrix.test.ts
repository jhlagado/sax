import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR157 parser: malformed export matrix', () => {
  it('reports explicit export diagnostics for malformed/unsupported export forms', async () => {
    const entry = join(__dirname, 'fixtures', 'pr157_export_malformed_matrix.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.artifacts).toEqual([]);

    const messages = res.diagnostics.map((d) => d.message);
    expect(messages).toContain('Invalid export statement');
    expect(messages).toContain('export is only permitted on const/func/op declarations');
    expect(messages).toContain('export not supported on section directives');
    expect(messages).toContain('export not supported on align directives');
    expect(messages).toContain('export not supported on extern declarations');
    expect(messages.some((m) => m.startsWith('Unsupported top-level construct:'))).toBe(false);
  });
});

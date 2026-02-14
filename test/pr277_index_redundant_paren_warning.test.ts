import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { DiagnosticIds } from '../src/diagnostics/types.js';
import { defaultFormatWriters } from '../src/formats/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR277: redundant grouped index warning', () => {
  it('warns for constant-only grouped index forms and ignores indirect Z80 patterns', async () => {
    const entry = join(__dirname, 'fixtures', 'pr277_index_redundant_paren_warning.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });

    const warnings = res.diagnostics.filter((d) => d.id === DiagnosticIds.IndexParenRedundant);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.message).toContain('Redundant outer parentheses in constant index');
    expect(res.diagnostics.some((d) => d.severity === 'error')).toBe(false);
  });
});

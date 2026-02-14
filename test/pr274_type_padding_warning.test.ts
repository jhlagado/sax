import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { DiagnosticIds } from '../src/diagnostics/types.js';
import { defaultFormatWriters } from '../src/formats/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR274: type padding warnings for power-of-2 storage', () => {
  it('emits warning for composite types that are padded to power-of-2 storage', async () => {
    const entry = join(__dirname, 'fixtures', 'pr274_type_padding_warning.zax');
    const res = await compile(
      entry,
      { typePaddingWarnings: true },
      { formats: defaultFormatWriters },
    );

    expect(res.diagnostics.some((d) => d.severity === 'error')).toBe(false);
    const paddingWarnings = res.diagnostics.filter(
      (d) => d.id === DiagnosticIds.TypePaddingWarning,
    );
    expect(paddingWarnings).toHaveLength(1);
    expect(paddingWarnings[0]?.message).toContain('Type "Sprite" size 5 padded to 8');
  });

  it('does not warn when type is explicitly padded to a power-of-2 size', async () => {
    const entry = join(__dirname, 'fixtures', 'pr274_type_padding_explicit_ok.zax');
    const res = await compile(
      entry,
      { typePaddingWarnings: true },
      { formats: defaultFormatWriters },
    );

    expect(res.diagnostics).toEqual([]);
  });
});

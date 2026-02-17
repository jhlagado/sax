import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR285 parser/AST closure: alias-init vs value-init', () => {
  it('accepts globals/local value-init and inferred alias-init forms', async () => {
    const entry = join(__dirname, 'fixtures', 'pr285_alias_init_globals_locals_positive.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });

    const errors = res.diagnostics.filter((d) => d.severity === 'error');
    expect(errors).toEqual([]);
  });

  it('rejects typed alias form in globals and function-local var blocks', async () => {
    const entry = join(__dirname, 'fixtures', 'pr285_typed_alias_invalid_matrix.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    const messages = res.diagnostics.map((d) => d.message);

    expect(messages).toContain(
      'Unsupported typed alias form for "bad_global": use "bad_global = base" for alias initialization.',
    );
    expect(messages).toContain(
      'Unsupported typed alias form for "bad_local": use "bad_local = base" for alias initialization.',
    );
  });

  it('rejects inferred alias declarations when rhs is not an address expression', async () => {
    const entry = join(__dirname, 'fixtures', 'pr285_incompatible_inferred_alias_matrix.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    const messages = res.diagnostics.map((d) => d.message);

    expect(messages).toContain(
      'Incompatible inferred alias binding for "bad_global": expected address expression on right-hand side.',
    );
    expect(messages).toContain(
      'Incompatible inferred alias binding for "bad_local": expected address expression on right-hand side.',
    );
  });

  it('rejects non-scalar local storage declarations without alias form', async () => {
    const entry = join(__dirname, 'fixtures', 'pr285_local_nonscalar_without_alias_negative.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    const messages = res.diagnostics.map((d) => d.message);

    expect(messages).toContain(
      'Non-scalar local storage declaration "local_arr" requires alias form ("local_arr = rhs").',
    );
  });
});

import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR179 parser: malformed type/union/var/data headers', () => {
  it('emits explicit expected-shape diagnostics for malformed type/union/var/data declarations', async () => {
    const entry = join(
      __dirname,
      'fixtures',
      'pr179_type_union_var_data_malformed_header_matrix.zax',
    );
    const res = await compile(entry, {}, { formats: defaultFormatWriters });

    const messages = res.diagnostics.map((d) => d.message);

    expect(messages).toContain(
      'Invalid type declaration line "type": expected <name> [<typeExpr>]',
    );
    expect(messages).toContain(
      'Invalid type declaration line "type 9Bad": expected <name> [<typeExpr>]',
    );
    expect(messages).toContain(
      'Invalid type declaration line "type Word =": expected <name> [<typeExpr>]',
    );
    expect(messages).toContain(
      'Invalid type declaration line "type Word [byte]": expected <name> [<typeExpr>]',
    );

    expect(messages).toContain('Invalid union declaration line "union": expected <name>');
    expect(messages).toContain('Invalid union declaration line "union 9Pair": expected <name>');
    expect(messages).toContain(
      'Invalid union declaration line "union Pair extra": expected <name>',
    );

    expect(messages).toContain('Invalid var declaration line "var extra": expected var');
    expect(messages).toContain('Invalid data declaration line "data extra": expected data');
    expect(messages.some((m) => m.startsWith('Unsupported top-level construct:'))).toBe(false);
  });
});

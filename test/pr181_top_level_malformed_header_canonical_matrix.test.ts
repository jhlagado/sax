import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR181 parser: canonical top-level malformed-header matrix', () => {
  it('emits canonical expected-shape diagnostics for malformed known top-level headers', async () => {
    const entry = join(
      __dirname,
      'fixtures',
      'pr181_top_level_malformed_header_canonical_matrix.zax',
    );
    const res = await compile(entry, {}, { formats: defaultFormatWriters });

    const messages = res.diagnostics.map((d) => d.message);

    expect(messages).toContain(
      'Invalid import statement line "import": expected "<path>.zax" or <moduleId>',
    );
    expect(messages).toContain(
      'Invalid type declaration line "type": expected <name> [<typeExpr>]',
    );
    expect(messages).toContain('Invalid union declaration line "union": expected <name>');
    expect(messages).toContain('Invalid var declaration line "var extra": expected var');
    expect(messages).toContain('Invalid func header line "func": expected <name>(...): <retType>');
    expect(messages).toContain('Invalid op header line "op": expected <name>(...)');
    expect(messages).toContain('Invalid extern base name "(": expected <identifier>.');
    expect(messages).toContain(
      'Invalid enum declaration line "enum": expected <name> <member>[, ...]',
    );
    expect(messages).toContain(
      'Invalid section directive line "section": expected <code|data|var> [at <imm16>]',
    );
    expect(messages).toContain('Invalid align directive line "align": expected <imm16>');
    expect(messages).toContain('Invalid const declaration line "const": expected <name> = <imm>');
    expect(messages).toContain(
      'Invalid bin declaration line "bin": expected <name> in <code|data> from "<path>"',
    );
    expect(messages).toContain('Invalid hex declaration line "hex": expected <name> from "<path>"');
    expect(messages).toContain('Invalid data declaration line "data extra": expected data');

    expect(messages.some((m) => m.startsWith('Unsupported top-level construct:'))).toBe(false);
  });
});

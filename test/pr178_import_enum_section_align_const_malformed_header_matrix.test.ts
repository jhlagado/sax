import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR178 parser: malformed import/enum/section/align/const headers', () => {
  it('emits explicit expected-shape diagnostics for malformed declaration headers', async () => {
    const entry = join(
      __dirname,
      'fixtures',
      'pr178_import_enum_section_align_const_malformed_header_matrix.zax',
    );
    const res = await compile(entry, {}, { formats: defaultFormatWriters });

    const messages = res.diagnostics.map((d) => d.message);
    expect(messages).toContain(
      'Invalid import statement line "import": expected "<path>.zax" or <moduleId>',
    );
    expect(messages).toContain(
      'Invalid import statement line "import \\"x.zax\\" trailing": expected "<path>.zax" or <moduleId>',
    );
    expect(messages).toContain(
      'Invalid import statement line "import 9bad": expected "<path>.zax" or <moduleId>',
    );

    expect(messages).toContain(
      'Invalid enum declaration line "enum": expected <name> <member>[, ...]',
    );
    expect(messages).toContain('Invalid enum name "9bad": expected <identifier>.');

    expect(messages).toContain(
      'Invalid section directive line "section": expected <code|data|var> [at <imm16>]',
    );
    expect(messages).toContain(
      'Invalid section directive line "section text at $1000": expected <code|data|var> [at <imm16>]',
    );

    expect(messages).toContain('Invalid align directive line "align": expected <imm16>');

    expect(messages).toContain('Invalid const declaration line "const": expected <name> = <imm>');
    expect(messages).toContain('Invalid const name "9bad": expected <identifier>.');
    expect(messages.some((m) => m.startsWith('Unsupported top-level construct:'))).toBe(false);
  });
});

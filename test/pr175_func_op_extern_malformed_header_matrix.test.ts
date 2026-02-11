import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR175 parser: malformed func/op/extern header matrix', () => {
  it('emits shape-specific diagnostics for malformed func/op/extern headers', async () => {
    const entry = join(__dirname, 'fixtures', 'pr175_func_op_extern_malformed_header_matrix.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });

    const messages = res.diagnostics.map((d) => d.message);
    expect(messages).toContain('Invalid func header line "func": expected <name>(...): <retType>');
    expect(messages).toContain(
      'Invalid func header line "func main(": expected <name>(...): <retType>',
    );
    expect(messages).toContain('Invalid func name "9bad": expected <identifier>.');
    expect(messages).toContain('Invalid func header: missing return type');

    expect(messages).toContain('Invalid op header line "op": expected <name>(...)');
    expect(messages).toContain('Invalid op header line "op macro(": expected <name>(...)');
    expect(messages).toContain('Invalid op name "9bad": expected <identifier>.');
    expect(messages).toContain('Invalid op header: unexpected trailing tokens');

    expect(messages).toContain(
      'Invalid extern declaration line "extern @bad": expected [<baseName>] or func <name>(...): <retType> at <imm16>',
    );
    expect(messages).toContain(
      'Invalid extern func declaration line "func": expected <name>(...): <retType> at <imm16>',
    );
    expect(messages).toContain(
      'Invalid extern func declaration line "func x(a: byte) at $1234": expected <name>(...): <retType> at <imm16>',
    );
    expect(messages).toContain(
      'Invalid extern func name "const": collides with a top-level keyword.',
    );

    expect(messages.some((m) => m.startsWith('Unsupported top-level construct:'))).toBe(false);
  });
});

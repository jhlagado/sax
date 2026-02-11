import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR213: condition-symbol base collision diagnostics parity', () => {
  it('treats condition-code symbolic bases as malformed conditional arity, not label fixups', async () => {
    const entry = join(
      __dirname,
      'fixtures',
      'pr213_condition_symbolic_base_collision_invalid.zax',
    );
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    const messages = res.diagnostics.map((d) => d.message);

    expect(messages.filter((m) => m === 'jp cc, nn expects two operands (cc, nn)')).toHaveLength(2);
    expect(messages.filter((m) => m === 'call cc, nn expects two operands (cc, nn)')).toHaveLength(
      2,
    );
    expect(
      messages.filter((m) => m === 'jr cc, disp expects two operands (cc, disp8)'),
    ).toHaveLength(2);

    expect(messages.some((m) => m.includes('Unresolved symbol'))).toBe(false);
    expect(messages.some((m) => m.startsWith('Unsupported instruction:'))).toBe(false);
  });
});

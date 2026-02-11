import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR172 parser: malformed block-body line diagnostics matrix', () => {
  it('emits explicit expected-shape diagnostics across block forms', async () => {
    const entry = join(__dirname, 'fixtures', 'pr172_block_body_malformed_line_matrix.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });

    const messages = res.diagnostics.map((d) => d.message);
    expect(messages).toContain(
      'Invalid record field declaration line "x byte": expected <name>: <type>',
    );
    expect(messages).toContain(
      'Invalid union field declaration line "lo byte": expected <name>: <type>',
    );
    expect(messages).toContain('Invalid var declaration line "g byte": expected <name>: <type>');
    expect(messages).toContain('Invalid var declaration line "tmp byte": expected <name>: <type>');
    expect(messages.some((m) => m.startsWith('Invalid extern func declaration line'))).toBe(true);
    expect(messages).toContain(
      'Invalid data declaration line "blob: byte [1]": expected <name>: <type> = <initializer>',
    );
    expect(messages.some((m) => m.startsWith('Unsupported top-level construct:'))).toBe(false);
  });
});

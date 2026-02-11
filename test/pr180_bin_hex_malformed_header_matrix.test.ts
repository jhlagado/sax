import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR180 parser: malformed bin/hex header matrix', () => {
  it('emits shape-specific diagnostics for malformed bin/hex declarations', async () => {
    const entry = join(__dirname, 'fixtures', 'pr180_bin_hex_malformed_header_matrix.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });

    const messages = res.diagnostics.map((d) => d.message);
    expect(messages).toContain(
      'Invalid bin declaration line "bin": expected <name> in <code|data> from "<path>"',
    );
    expect(messages).toContain(
      'Invalid bin declaration line "bin asset": expected <name> in <code|data> from "<path>"',
    );
    expect(messages).toContain(
      'Invalid bin declaration line "bin asset in code": expected <name> in <code|data> from "<path>"',
    );
    expect(messages).toContain('Invalid bin section "text": expected "code" or "data".');
    expect(messages).toContain('Invalid bin name "1asset": expected <identifier>.');
    expect(messages).toContain('Invalid bin declaration: expected quoted source path');

    expect(messages).toContain('Invalid hex declaration line "hex": expected <name> from "<path>"');
    expect(messages).toContain(
      'Invalid hex declaration line "hex dump": expected <name> from "<path>"',
    );
    expect(messages).toContain('Invalid hex name "9dump": expected <identifier>.');
    expect(messages).toContain('Invalid hex declaration: expected quoted source path');
    expect(messages.some((m) => m.startsWith('Unsupported top-level construct:'))).toBe(false);
  });
});

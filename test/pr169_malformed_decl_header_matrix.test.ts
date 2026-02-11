import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR169 parser: malformed declaration header diagnostics matrix', () => {
  it('emits declaration-specific diagnostics for malformed enum/const/bin/hex headers', async () => {
    const entry = join(__dirname, 'fixtures', 'pr169_malformed_decl_header_matrix.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });

    const messages = res.diagnostics.map((d) => d.message);
    expect(messages).toContain('Invalid enum member name "9bad".');
    expect(messages).toContain('Invalid const declaration: missing initializer');
    expect(messages).toContain('Invalid bin name "1asset": expected <identifier>.');
    expect(messages).toContain('Invalid bin section "text": expected "code" or "data".');
    expect(messages).toContain('Invalid bin declaration: expected quoted source path');
    expect(messages).toContain('Invalid hex name "9dump": expected <identifier>.');
    expect(messages).toContain('Invalid hex declaration: expected quoted source path');
    expect(messages.some((m) => m.startsWith('Unsupported top-level construct:'))).toBe(false);
  });
});

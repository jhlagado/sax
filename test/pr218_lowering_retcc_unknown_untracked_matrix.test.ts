import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR218 lowering: ret cc diagnostics under unknown/untracked stack states', () => {
  it('diagnoses ret cc and fallthrough guards when stack tracking is invalidated by join mismatch and op-level SP mutation', async () => {
    const entry = join(__dirname, 'fixtures', 'pr218_lowering_retcc_unknown_untracked_matrix.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.artifacts).toEqual([]);

    const messages = res.diagnostics.map((d) => d.message);
    expect(messages.some((m) => m.includes('Stack depth mismatch at if join'))).toBe(true);
    expect(
      messages.some((m) =>
        m.includes('ret reached with unknown stack depth; cannot verify function stack balance.'),
      ),
    ).toBe(true);
    expect(
      messages.some((m) =>
        m.includes(
          'Function "unknown_retcc_from_if" has unknown stack depth at fallthrough; cannot verify stack balance.',
        ),
      ),
    ).toBe(true);

    expect(
      messages.some((m) =>
        m.includes('expansion performs untracked SP mutation; cannot verify net stack delta'),
      ),
    ).toBe(true);
    expect(
      messages.some((m) =>
        m.includes(
          'ret reached after untracked SP mutation; cannot verify function stack balance.',
        ),
      ),
    ).toBe(true);
    expect(
      messages.some((m) =>
        m.includes(
          'Function "untracked_retcc_from_op" has untracked SP mutation at fallthrough; cannot verify stack balance.',
        ),
      ),
    ).toBe(true);
  });
});

import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR199 lowering mismatch propagation across joins/back-edges/op boundaries', () => {
  it('invalidates stack tracking after mismatch diagnostics so downstream returns are guarded', async () => {
    const entry = join(__dirname, 'fixtures', 'pr199_lowering_mismatch_propagation.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.artifacts).toEqual([]);

    const messages = res.diagnostics.map((d) => d.message);

    expect(messages.some((m) => m.includes('Stack depth mismatch at if/else join'))).toBe(true);
    expect(messages.some((m) => m.includes('Stack depth mismatch at while back-edge'))).toBe(true);
    expect(messages.some((m) => m.includes('Stack depth mismatch at repeat/until'))).toBe(true);
    expect(messages.some((m) => m.includes('Stack depth mismatch at select join'))).toBe(true);

    expect(
      messages.some((m) =>
        m.includes(
          'op "maybe_leak" expansion leaves stack depth untrackable; cannot verify net stack delta.',
        ),
      ),
    ).toBe(true);

    const unknownRetCount = messages.filter((m) =>
      m.includes('ret reached with unknown stack depth; cannot verify function stack balance.'),
    ).length;
    expect(unknownRetCount).toBeGreaterThanOrEqual(5);
  });
});

import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR224 lowering: call-boundary stack invariant matrix', () => {
  it('keeps diagnostics scoped to unsafe callers while safe callees remain unaffected', async () => {
    const entry = join(__dirname, 'fixtures', 'pr224_lowering_call_boundary_stack_matrix.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.artifacts).toEqual([]);

    const messages = res.diagnostics.map((d) => d.message);

    expect(
      messages.some((m) =>
        m.includes(
          'typed call "callee_safe" reached with unknown stack depth; cannot verify typed-call boundary contract.',
        ),
      ),
    ).toBe(true);
    expect(
      messages.some((m) =>
        m.includes(
          'typed call "callee_safe" reached after untracked SP mutation; cannot verify typed-call boundary contract.',
        ),
      ),
    ).toBe(true);

    expect(
      messages.some((m) =>
        m.includes('ret reached with unknown stack depth; cannot verify function stack balance.'),
      ),
    ).toBe(true);

    expect(
      messages.some((m) =>
        m.includes(
          'ret reached after untracked SP mutation; cannot verify function stack balance.',
        ),
      ),
    ).toBe(true);

    expect(messages.some((m) => m.includes('Stack depth mismatch at select join'))).toBe(true);
    expect(
      messages.some((m) =>
        m.includes(
          'Function "caller_unknown_select_call_fallthrough" has unknown stack depth at fallthrough; cannot verify stack balance.',
        ),
      ),
    ).toBe(true);

    expect(
      messages.some((m) =>
        m.includes('Function "callee_safe" has unknown stack depth at fallthrough'),
      ),
    ).toBe(false);
  });
});

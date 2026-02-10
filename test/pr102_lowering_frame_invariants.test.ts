import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR102 lowering/frame invariants with locals', () => {
  it('diagnoses if-join stack mismatch when locals are present', async () => {
    const entry = join(__dirname, 'fixtures', 'pr102_if_stack_mismatch_with_locals.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.artifacts).toEqual([]);
    expect(res.diagnostics.some((d) => d.message.includes('Stack depth mismatch at if join'))).toBe(
      true,
    );
  });

  it('diagnoses while back-edge stack mismatch when locals are present', async () => {
    const entry = join(__dirname, 'fixtures', 'pr102_while_stack_mismatch_with_locals.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.artifacts).toEqual([]);
    expect(
      res.diagnostics.some((d) => d.message.includes('Stack depth mismatch at while back-edge')),
    ).toBe(true);
  });

  it('diagnoses repeat/until stack mismatch when locals are present', async () => {
    const entry = join(__dirname, 'fixtures', 'pr102_repeat_stack_mismatch_with_locals.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.artifacts).toEqual([]);
    expect(
      res.diagnostics.some((d) => d.message.includes('Stack depth mismatch at repeat/until')),
    ).toBe(true);
  });
});

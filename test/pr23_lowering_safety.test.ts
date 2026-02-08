import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';
import type { BinArtifact } from '../src/formats/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR23 lowering safety checks', () => {
  it('diagnoses op expansions with non-zero net stack delta', async () => {
    const entry = join(__dirname, 'fixtures', 'pr23_op_unbalanced_stack.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.diagnostics.some((d) => d.message.includes('non-zero net stack delta'))).toBe(true);
  });

  it('diagnoses ret with non-zero tracked stack delta', async () => {
    const entry = join(__dirname, 'fixtures', 'pr23_ret_stack_imbalance.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(
      res.diagnostics.some((d) => d.message.includes('ret with non-zero tracked stack delta')),
    ).toBe(true);
  });

  it('emits an implicit ret for fallthrough functions without locals', async () => {
    const entry = join(__dirname, 'fixtures', 'pr23_implicit_ret_no_locals.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.diagnostics).toEqual([]);
    const bin = res.artifacts.find((a): a is BinArtifact => a.kind === 'bin');
    expect(bin).toBeDefined();
    expect(bin!.bytes).toEqual(Uint8Array.of(0x00, 0xc9)); // nop; ret
  });

  it('allows fallthrough into synthetic epilogue for functions with locals', async () => {
    const entry = join(__dirname, 'fixtures', 'pr23_implicit_ret_with_locals.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.diagnostics).toEqual([]);
    const bin = res.artifacts.find((a): a is BinArtifact => a.kind === 'bin');
    expect(bin).toBeDefined();
    // push bc; nop; jp epilogue; epilogue: pop bc; ret
    expect(bin!.bytes).toEqual(Uint8Array.of(0xc5, 0x00, 0xc3, 0x05, 0x00, 0xc1, 0xc9));
  });
});

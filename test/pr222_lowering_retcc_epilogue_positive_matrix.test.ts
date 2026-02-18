import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';
import type { BinArtifact } from '../src/formats/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe.skip('PR222 lowering: positive epilogue rewriting matrix for locals + ret cc', () => {
  it('rewrites multiple ret cc paths with locals to a single shared epilogue', async () => {
    const entry = join(__dirname, 'fixtures', 'pr222_locals_multiple_retcc.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.diagnostics).toEqual([]);

    const bin = res.artifacts.find((a): a is BinArtifact => a.kind === 'bin');
    expect(bin).toBeDefined();
    expect(bin!.bytes).toEqual(
      Uint8Array.of(0xc5, 0xc2, 0x0b, 0x00, 0xca, 0x0b, 0x00, 0x00, 0xc3, 0x0b, 0x00, 0xc1, 0xc9),
    );
  });

  it('rewrites mixed ret cc and ret with locals to one epilogue target', async () => {
    const entry = join(__dirname, 'fixtures', 'pr222_locals_retcc_and_ret.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.diagnostics).toEqual([]);

    const bin = res.artifacts.find((a): a is BinArtifact => a.kind === 'bin');
    expect(bin).toBeDefined();
    expect(bin!.bytes).toEqual(Uint8Array.of(0xc5, 0xca, 0x07, 0x00, 0xc3, 0x07, 0x00, 0xc1, 0xc9));
  });

  it('keeps stack tracking valid for stack-neutral op expansions inside nested structured control', async () => {
    const entry = join(__dirname, 'fixtures', 'pr222_neutral_op_structured_retcc.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.diagnostics).toEqual([]);

    const bin = res.artifacts.find((a): a is BinArtifact => a.kind === 'bin');
    expect(bin).toBeDefined();

    const bytes = [...bin!.bytes];
    expect(bytes.filter((b) => b === 0xc9)).toHaveLength(1);
    expect(bytes[bytes.length - 2]).toBe(0xc1);
    expect(bytes[bytes.length - 1]).toBe(0xc9);
    expect(bytes).toContain(0xca);
    expect(bytes).toContain(0xc2);
  });

  it('rewrites ret cc with two local slots to one shared two-pop epilogue', async () => {
    const entry = join(__dirname, 'fixtures', 'pr222_two_slot_locals_retcc.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.diagnostics).toEqual([]);

    const bin = res.artifacts.find((a): a is BinArtifact => a.kind === 'bin');
    expect(bin).toBeDefined();
    expect(bin!.bytes).toEqual(
      Uint8Array.of(0xc5, 0xc5, 0xca, 0x09, 0x00, 0x00, 0xc3, 0x09, 0x00, 0xc1, 0xc1, 0xc9),
    );
  });

  it('keeps a single terminal epilogue ret for stack-neutral op expansions in if/else with two local slots', async () => {
    const entry = join(__dirname, 'fixtures', 'pr222_two_slot_neutral_op_if_retcc.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.diagnostics).toEqual([]);

    const bin = res.artifacts.find((a): a is BinArtifact => a.kind === 'bin');
    expect(bin).toBeDefined();

    const bytes = [...bin!.bytes];
    expect(bytes.filter((b) => b === 0xc9)).toHaveLength(1);
    expect(bytes.filter((b) => b === 0xc1)).toHaveLength(2);
    expect(bytes[bytes.length - 3]).toBe(0xc1);
    expect(bytes[bytes.length - 2]).toBe(0xc1);
    expect(bytes[bytes.length - 1]).toBe(0xc9);
    expect(bytes).toContain(0xca);
    expect(bytes).toContain(0xc2);
  });
});

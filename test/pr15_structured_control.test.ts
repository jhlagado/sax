import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';
import type { BinArtifact } from '../src/formats/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR15 structured asm control flow', () => {
  it('lowers if/else to conditional and unconditional jumps', async () => {
    const entry = join(__dirname, 'fixtures', 'pr15_if_else.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.diagnostics).toEqual([]);
    const bin = res.artifacts.find((a): a is BinArtifact => a.kind === 'bin');
    expect(bin).toBeDefined();

    expect(bin!.bytes).toEqual(
      Uint8Array.of(0xca, 0x07, 0x00, 0x00, 0xc3, 0x09, 0x00, 0x3e, 0x01, 0xc9),
    );
  });

  it('lowers while loops with a back-edge to condition', async () => {
    const entry = join(__dirname, 'fixtures', 'pr15_while.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.diagnostics).toEqual([]);
    const bin = res.artifacts.find((a): a is BinArtifact => a.kind === 'bin');
    expect(bin).toBeDefined();

    expect(bin!.bytes).toEqual(Uint8Array.of(0xca, 0x07, 0x00, 0x00, 0xc3, 0x00, 0x00, 0xc9));
  });

  it('lowers repeat/until loops with inverse-condition branch', async () => {
    const entry = join(__dirname, 'fixtures', 'pr15_repeat_until.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.diagnostics).toEqual([]);
    const bin = res.artifacts.find((a): a is BinArtifact => a.kind === 'bin');
    expect(bin).toBeDefined();

    expect(bin!.bytes).toEqual(Uint8Array.of(0x00, 0xca, 0x00, 0x00, 0xc9));
  });

  it('lowers select/case dispatch and emits compare chain', async () => {
    const entry = join(__dirname, 'fixtures', 'pr15_select_cases.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.diagnostics).toEqual([]);
    const bin = res.artifacts.find((a): a is BinArtifact => a.kind === 'bin');
    expect(bin).toBeDefined();

    expect([...bin!.bytes]).toContain(0xc3); // contains hidden dispatch jumps
    expect([...bin!.bytes]).toContain(0xfe); // cp imm8 used by compare chain
    expect([...bin!.bytes]).toContain(0x06); // ld b, imm8 arm code
    expect([...bin!.bytes]).toContain(0x0e); // ld c, imm8 arm code
    expect([...bin!.bytes]).toContain(0x16); // ld d, imm8 else arm code
    expect(bin!.bytes[bin!.bytes.length - 1]).toBe(0xc9);
  });

  it('diagnoses stack-depth mismatch at if join', async () => {
    const entry = join(__dirname, 'fixtures', 'pr15_if_stack_mismatch.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.artifacts).toEqual([]);
    expect(res.diagnostics.some((d) => d.message.includes('Stack depth mismatch at if join'))).toBe(
      true,
    );
  });

  it('diagnoses stack-depth mismatch at while back-edge', async () => {
    const entry = join(__dirname, 'fixtures', 'pr15_while_stack_mismatch.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.artifacts).toEqual([]);
    expect(
      res.diagnostics.some((d) => d.message.includes('Stack depth mismatch at while back-edge')),
    ).toBe(true);
  });

  it('diagnoses stack-depth mismatch at repeat/until back-edge', async () => {
    const entry = join(__dirname, 'fixtures', 'pr15_repeat_stack_mismatch.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.artifacts).toEqual([]);
    expect(
      res.diagnostics.some((d) => d.message.includes('Stack depth mismatch at repeat/until')),
    ).toBe(true);
  });

  it('supports nested structured control flow', async () => {
    const entry = join(__dirname, 'fixtures', 'pr15_nested_while_if.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.diagnostics).toEqual([]);
    const bin = res.artifacts.find((a): a is BinArtifact => a.kind === 'bin');
    expect(bin).toBeDefined();
    expect([...bin!.bytes]).toContain(0xca);
    expect([...bin!.bytes]).toContain(0xc2);
    expect(bin!.bytes[bin!.bytes.length - 1]).toBe(0xc9);
  });

  it('supports deeper nested select->if->while control flow', async () => {
    const entry = join(__dirname, 'fixtures', 'pr15_nested_select_if_while.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.diagnostics).toEqual([]);
    const bin = res.artifacts.find((a): a is BinArtifact => a.kind === 'bin');
    expect(bin).toBeDefined();
    expect([...bin!.bytes]).toContain(0xc3);
    expect([...bin!.bytes]).toContain(0xca);
    expect([...bin!.bytes]).toContain(0xc2);
    expect(bin!.bytes[bin!.bytes.length - 1]).toBe(0xc9);
  });

  it('supports select with a single case arm', async () => {
    const entry = join(__dirname, 'fixtures', 'pr15_select_single_case.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.diagnostics).toEqual([]);
    const bin = res.artifacts.find((a): a is BinArtifact => a.kind === 'bin');
    expect(bin).toBeDefined();
    expect([...bin!.bytes]).toContain(0xfe);
    expect([...bin!.bytes]).toContain(0x06);
    expect(bin!.bytes[bin!.bytes.length - 1]).toBe(0xc9);
  });

  it('diagnoses duplicate case values in select', async () => {
    const entry = join(__dirname, 'fixtures', 'pr15_select_duplicate_case.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.artifacts).toEqual([]);
    expect(res.diagnostics.some((d) => d.message.includes('Duplicate case value'))).toBe(true);
  });

  it('diagnoses until without matching repeat', async () => {
    const entry = join(__dirname, 'fixtures', 'pr15_until_without_repeat.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.artifacts).toEqual([]);
    expect(res.diagnostics.some((d) => d.message.includes('without matching "repeat"'))).toBe(true);
  });
});

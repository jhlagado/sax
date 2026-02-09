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

  it('reports select join stack mismatch once', async () => {
    const entry = join(__dirname, 'fixtures', 'pr29_select_stack_mismatch_dedup.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.artifacts).toEqual([]);
    const joinMismatch = res.diagnostics.filter((d) =>
      d.message.includes('Stack depth mismatch at select join'),
    );
    expect(joinMismatch).toHaveLength(1);
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

  it('diagnoses select with no arms', async () => {
    const entry = join(__dirname, 'fixtures', 'parser_select_no_arms.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.artifacts).toEqual([]);
    expect(res.diagnostics).toHaveLength(1);
    expect(res.diagnostics[0]?.message).toBe(
      '"select" must contain at least one arm ("case" or "else")',
    );
  });

  it('supports stacked case labels sharing a single clause body', async () => {
    const entry = join(__dirname, 'fixtures', 'pr28_select_stacked_case_shared_body.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.diagnostics).toEqual([]);
    const bin = res.artifacts.find((a): a is BinArtifact => a.kind === 'bin');
    expect(bin).toBeDefined();
    expect([...bin!.bytes]).toContain(0xc5);
    expect([...bin!.bytes]).toContain(0xc1);
    expect(bin!.bytes[bin!.bytes.length - 1]).toBe(0xc9);
  });

  it('supports stacked case labels across 3+ values', async () => {
    const entry = join(__dirname, 'fixtures', 'pr28_select_stacked_case_many_labels.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.diagnostics).toEqual([]);
    const bin = res.artifacts.find((a): a is BinArtifact => a.kind === 'bin');
    expect(bin).toBeDefined();
    expect([...bin!.bytes]).toContain(0x06); // ld b, imm8 (shared stacked-case body)
    expect([...bin!.bytes]).toContain(0x0e); // ld c, imm8 (else body)
    expect(bin!.bytes[bin!.bytes.length - 1]).toBe(0xc9);
  });

  it('treats non-empty case body as a boundary for later stacked cases', async () => {
    const entry = join(__dirname, 'fixtures', 'pr28_select_stacked_case_split_body.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.diagnostics).toEqual([]);
    const bin = res.artifacts.find((a): a is BinArtifact => a.kind === 'bin');
    expect(bin).toBeDefined();
    expect([...bin!.bytes]).toContain(0x00); // nop in case 0 body
    expect([...bin!.bytes]).toContain(0x06); // ld b, imm8 in shared body for case 1/2
    expect([...bin!.bytes]).toContain(0x0e); // ld c, imm8 in else body
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
    expect(res.diagnostics).toHaveLength(1);
    expect(res.diagnostics[0]?.message).toBe('"until" without matching "repeat"');
  });

  it('diagnoses case without matching select', async () => {
    const entry = join(__dirname, 'fixtures', 'pr30_case_without_select.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.artifacts).toEqual([]);
    expect(res.diagnostics).toHaveLength(1);
    expect(res.diagnostics[0]?.message).toBe('"case" without matching "select"');
  });

  it('diagnoses else without matching if or select', async () => {
    const entry = join(__dirname, 'fixtures', 'pr30_else_without_if_or_select.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.artifacts).toEqual([]);
    expect(res.diagnostics).toHaveLength(1);
    expect(res.diagnostics[0]?.message).toBe('"else" without matching "if" or "select"');
  });

  it('diagnoses duplicate else in if', async () => {
    const entry = join(__dirname, 'fixtures', 'parser_if_duplicate_else.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.artifacts).toEqual([]);
    expect(res.diagnostics).toHaveLength(1);
    expect(res.diagnostics[0]?.message).toBe('"else" duplicated in if');
  });

  it('diagnoses if without a condition code', async () => {
    const entry = join(__dirname, 'fixtures', 'parser_if_missing_cc.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.artifacts).toEqual([]);
    expect(res.diagnostics).toHaveLength(1);
    expect(res.diagnostics[0]?.message).toBe('"if" expects a condition code');
  });

  it('diagnoses invalid if syntax (no cascades)', async () => {
    const entry = join(__dirname, 'fixtures', 'parser_if_invalid_cc.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.artifacts).toEqual([]);
    expect(res.diagnostics).toHaveLength(1);
    expect(res.diagnostics[0]?.message).toBe('"if" expects a condition code');
  });

  it('diagnoses while without a condition code', async () => {
    const entry = join(__dirname, 'fixtures', 'parser_while_missing_cc.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.artifacts).toEqual([]);
    expect(res.diagnostics).toHaveLength(1);
    expect(res.diagnostics[0]?.message).toBe('"while" expects a condition code');
  });

  it('diagnoses invalid while syntax (no cascades)', async () => {
    const entry = join(__dirname, 'fixtures', 'parser_while_invalid_cc.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.artifacts).toEqual([]);
    expect(res.diagnostics).toHaveLength(1);
    expect(res.diagnostics[0]?.message).toBe('"while" expects a condition code');
  });

  it('diagnoses until without a condition code', async () => {
    const entry = join(__dirname, 'fixtures', 'parser_until_missing_cc.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.artifacts).toEqual([]);
    expect(res.diagnostics).toHaveLength(1);
    expect(res.diagnostics[0]?.message).toBe('"until" expects a condition code');
  });

  it('diagnoses invalid until syntax (no cascades)', async () => {
    const entry = join(__dirname, 'fixtures', 'parser_until_invalid_cc.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.artifacts).toEqual([]);
    expect(res.diagnostics).toHaveLength(1);
    expect(res.diagnostics[0]?.message).toBe('"until" expects a condition code');
  });

  it('diagnoses select without a selector', async () => {
    const entry = join(__dirname, 'fixtures', 'parser_select_missing_selector.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.artifacts).toEqual([]);
    expect(res.diagnostics).toHaveLength(1);
    expect(res.diagnostics[0]?.message).toBe('"select" expects a selector');
  });

  it('diagnoses invalid select selector (no cascades)', async () => {
    const entry = join(__dirname, 'fixtures', 'parser_select_invalid_selector.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.artifacts).toEqual([]);
    expect(res.diagnostics).toHaveLength(1);
    expect(res.diagnostics[0]?.message).toBe('Invalid select selector');
  });

  it('diagnoses case without a value', async () => {
    const entry = join(__dirname, 'fixtures', 'parser_case_missing_value.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.artifacts).toEqual([]);
    expect(res.diagnostics).toHaveLength(1);
    expect(res.diagnostics[0]?.message).toBe('"case" expects a value');
  });

  it('diagnoses unterminated control at EOF', async () => {
    const entry = join(__dirname, 'fixtures', 'parser_unterminated_if_eof.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.artifacts).toEqual([]);
    expect(res.diagnostics.some((d) => d.message === '"if" without matching "end"')).toBe(true);
    expect(res.diagnostics.some((d) => d.message.includes('Unterminated func "main"'))).toBe(true);
  });

  it('diagnoses repeat closed by end (until required)', async () => {
    const entry = join(__dirname, 'fixtures', 'pr32_repeat_closed_by_end.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.artifacts).toEqual([]);
    expect(res.diagnostics).toHaveLength(1);
    expect(res.diagnostics[0]?.message).toBe('"repeat" blocks must close with "until <cc>"');
  });

  it('diagnoses case after else in select', async () => {
    const entry = join(__dirname, 'fixtures', 'pr33_select_case_after_else.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.artifacts).toEqual([]);
    expect(res.diagnostics).toHaveLength(1);
    expect(res.diagnostics[0]?.message).toBe('"case" after "else" in select');
  });

  it('diagnoses duplicate else in select', async () => {
    const entry = join(__dirname, 'fixtures', 'pr33_select_duplicate_else.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.artifacts).toEqual([]);
    expect(res.diagnostics).toHaveLength(1);
    expect(res.diagnostics[0]?.message).toBe('"else" duplicated in select');
  });
});

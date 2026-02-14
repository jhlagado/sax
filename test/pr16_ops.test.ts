import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';
import type { BinArtifact } from '../src/formats/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR16 op declarations and expansion', () => {
  it('expands a basic op invocation with matcher substitution', async () => {
    const entry = join(__dirname, 'fixtures', 'pr16_op_basic.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.diagnostics).toEqual([]);

    const bin = res.artifacts.find((a): a is BinArtifact => a.kind === 'bin');
    expect(bin).toBeDefined();
    expect(bin!.bytes).toEqual(Uint8Array.of(0x06, 0x07, 0xc9));
  });

  it('diagnoses when no op overload matches operands', async () => {
    const entry = join(__dirname, 'fixtures', 'pr16_op_no_match.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.artifacts).toEqual([]);
    expect(res.diagnostics.some((d) => d.message.includes('No matching op overload'))).toBe(true);
  });

  it('selects fixed-token overloads over class matchers', async () => {
    const entry = join(__dirname, 'fixtures', 'pr16_op_ambiguous.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.diagnostics).toEqual([]);

    const bin = res.artifacts.find((a): a is BinArtifact => a.kind === 'bin');
    expect(bin).toBeDefined();
    expect(bin!.bytes).toEqual(Uint8Array.of(0x06, 0x02, 0xc9));
  });

  it('diagnoses ambiguous overloads when candidates are incomparable', async () => {
    const entry = join(__dirname, 'fixtures', 'pr267_op_ambiguous_incomparable.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.artifacts).toEqual([]);
    expect(res.diagnostics.some((d) => d.message.includes('Ambiguous op overload'))).toBe(true);
  });

  it('diagnoses cyclic op expansion', async () => {
    const entry = join(__dirname, 'fixtures', 'pr16_op_cycle.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.artifacts).toEqual([]);
    expect(res.diagnostics.some((d) => d.message.includes('Cyclic op expansion'))).toBe(true);
  });

  it('supports nested non-cyclic op expansion', async () => {
    const entry = join(__dirname, 'fixtures', 'pr16_op_nested_call.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.diagnostics).toEqual([]);

    const bin = res.artifacts.find((a): a is BinArtifact => a.kind === 'bin');
    expect(bin).toBeDefined();
    expect(bin!.bytes).toEqual(Uint8Array.of(0x06, 0x01, 0x0e, 0x02, 0xc9));
  });

  it('distinguishes mem8 and mem16 overloads when width is known', async () => {
    const entry = join(__dirname, 'fixtures', 'pr16_op_mem_width.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.diagnostics).toEqual([]);

    const bin = res.artifacts.find((a): a is BinArtifact => a.kind === 'bin');
    expect(bin).toBeDefined();
    expect([...bin!.bytes]).toContain(0x3a); // ld a,(nn) fast-path for absolute EA
    expect([...bin!.bytes]).toContain(0x2a); // ld hl,(nn) fast-path for absolute EA
    expect([...bin!.bytes]).toContain(0x34); // data low byte of $1234
    expect([...bin!.bytes]).toContain(0x12); // data high byte of $1234
  });

  it('selects imm8 overloads over imm16 for small immediates', async () => {
    const entry = join(__dirname, 'fixtures', 'pr267_op_specific_imm_width.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.diagnostics).toEqual([]);

    const bin = res.artifacts.find((a): a is BinArtifact => a.kind === 'bin');
    expect(bin).toBeDefined();
    expect(bin!.bytes).toEqual(Uint8Array.of(0x06, 0x02, 0xc9));
  });

  it('selects mem overloads over ea when call-site uses dereference operands', async () => {
    const entry = join(__dirname, 'fixtures', 'pr267_op_specific_mem_vs_ea.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.diagnostics).toEqual([]);

    const bin = res.artifacts.find((a): a is BinArtifact => a.kind === 'bin');
    expect(bin).toBeDefined();
    expect(bin!.bytes).toEqual(Uint8Array.of(0x06, 0x02, 0xc9));
  });

  it('avoids spurious imm-evaluation diagnostics during overload matching', async () => {
    const entry = join(__dirname, 'fixtures', 'pr16_op_no_spurious_eval_diag.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.artifacts).toEqual([]);
    expect(res.diagnostics.some((d) => d.message.includes('No matching op overload'))).toBe(true);
    expect(res.diagnostics.some((d) => d.message.includes('Failed to evaluate'))).toBe(false);
  });

  it('supports labels inside op bodies across repeated expansion sites', async () => {
    const entry = join(__dirname, 'fixtures', 'pr188_op_local_labels_repeated.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.diagnostics).toEqual([]);

    const bin = res.artifacts.find((a): a is BinArtifact => a.kind === 'bin');
    expect(bin).toBeDefined();
    expect(bin!.bytes).toEqual(Uint8Array.of(0x00, 0x18, 0xfd, 0x00, 0x18, 0xfd, 0xc9));
  });

  it('supports structured select control inside op bodies', async () => {
    const entry = join(__dirname, 'fixtures', 'pr188_op_structured_select.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.diagnostics).toEqual([]);

    const bin = res.artifacts.find((a): a is BinArtifact => a.kind === 'bin');
    expect(bin).toBeDefined();
    expect(bin!.bytes.includes(0x00)).toBe(true);
    expect(bin!.bytes[bin!.bytes.length - 1]).toBe(0xc9);
  });

  it('supports fixed-token condition parameters in op-body control flow', async () => {
    const entry = join(__dirname, 'fixtures', 'pr188_op_condition_param_control.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.diagnostics).toEqual([]);

    const bin = res.artifacts.find((a): a is BinArtifact => a.kind === 'bin');
    expect(bin).toBeDefined();
    expect(bin!.bytes[bin!.bytes.length - 1]).toBe(0xc9);
  });

  it('supports idx16 matcher for IX/IY indexed memory operands', async () => {
    const entry = join(__dirname, 'fixtures', 'pr258_op_idx16_matcher.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.diagnostics).toEqual([]);

    const bin = res.artifacts.find((a): a is BinArtifact => a.kind === 'bin');
    expect(bin).toBeDefined();
    expect(bin!.bytes).toEqual(Uint8Array.of(0xdd, 0x7e, 0x02, 0xfd, 0x46, 0x00, 0xc9));
  });

  it('supports cc matcher for op-body structured control substitution', async () => {
    const entry = join(__dirname, 'fixtures', 'pr258_op_cc_matcher.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.diagnostics).toEqual([]);

    const bin = res.artifacts.find((a): a is BinArtifact => a.kind === 'bin');
    expect(bin).toBeDefined();
    expect(bin!.bytes[bin!.bytes.length - 1]).toBe(0xc9);
  });

  it('diagnoses non-condition operands for cc matcher', async () => {
    const entry = join(__dirname, 'fixtures', 'pr258_op_cc_matcher_invalid.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.artifacts).toEqual([]);
    expect(res.diagnostics.some((d) => d.message.includes('No matching op overload'))).toBe(true);
  });

  it('keeps dotted field operands as ea for matcher resolution', async () => {
    const entry = join(__dirname, 'fixtures', 'pr259_op_ea_dotted_field.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.diagnostics).toEqual([]);

    const bin = res.artifacts.find((a): a is BinArtifact => a.kind === 'bin');
    expect(bin).toBeDefined();
    expect(bin!.bytes[bin!.bytes.length - 1]).toBe(0xc9);
  });

  it('substitutes nested ea expressions inside op bodies', async () => {
    const entry = join(__dirname, 'fixtures', 'pr188_op_ea_nested_substitution.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.diagnostics).toEqual([]);

    const bin = res.artifacts.find((a): a is BinArtifact => a.kind === 'bin');
    expect(bin).toBeDefined();
    expect(bin!.bytes.includes(0x3a)).toBe(true);
    expect(bin!.bytes.includes(0xc9)).toBe(true);
  });

  it('parses implicit op instruction-stream bodies', async () => {
    const entry = join(__dirname, 'fixtures', 'pr191_op_optional_asm_prefix.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.diagnostics).toEqual([]);

    const bin = res.artifacts.find((a): a is BinArtifact => a.kind === 'bin');
    expect(bin).toBeDefined();
    expect(bin!.bytes).toEqual(Uint8Array.of(0x06, 0x07, 0xc9));
  });
});

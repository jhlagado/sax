import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';
import type { BinArtifact } from '../src/formats/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR12 calls (extern + func)', () => {
  it('lowers an extern func call with byte arg', async () => {
    const entry = join(__dirname, 'fixtures', 'pr12_extern_call.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.diagnostics).toEqual([]);

    const bin = res.artifacts.find((a): a is BinArtifact => a.kind === 'bin');
    expect(bin).toBeDefined();

    // puts 7 => ld hl,7; push hl; call $1234; pop bc; ret
    expect(bin!.bytes).toEqual(Uint8Array.of(0x21, 0x07, 0x00, 0xe5, 0xcd, 0x34, 0x12, 0xc1, 0xc9));
  });

  it('supports forward-referenced calls to other funcs', async () => {
    const entry = join(__dirname, 'fixtures', 'pr12_func_call_forward.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.diagnostics).toEqual([]);

    const bin = res.artifacts.find((a): a is BinArtifact => a.kind === 'bin');
    expect(bin).toBeDefined();

    // main: call helper (at 4), ret; helper: ret
    expect(bin!.bytes).toEqual(Uint8Array.of(0xcd, 0x04, 0x00, 0xc9, 0xc9));
  });

  it('diagnoses wrong argument count with a source location', async () => {
    const entry = join(__dirname, 'fixtures', 'pr12_call_wrong_arity.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.artifacts).toEqual([]);
    expect(res.diagnostics).toHaveLength(1);
    expect(res.diagnostics[0]?.message).toContain('expects 1');
    expect(res.diagnostics[0]?.file).toBe(entry);
    expect(res.diagnostics[0]?.line).toBe(6);
    expect(res.diagnostics[0]?.column).toBe(1);
  });

  it('truncates byte immediates to low 8 bits', async () => {
    const entry = join(__dirname, 'fixtures', 'pr12_call_byte_oob.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.diagnostics).toEqual([]);

    const bin = res.artifacts.find((a): a is BinArtifact => a.kind === 'bin');
    expect(bin).toBeDefined();

    // puts 256 => low8 = 0 => ld hl,0; push hl; call $1234; pop bc; ret
    expect(bin!.bytes).toEqual(Uint8Array.of(0x21, 0x00, 0x00, 0xe5, 0xcd, 0x34, 0x12, 0xc1, 0xc9));
  });

  it('supports ea and (ea) arguments for module-scope data symbols', async () => {
    const entry = join(__dirname, 'fixtures', 'pr13_call_ea_mem.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.diagnostics).toEqual([]);

    const bin = res.artifacts.find((a): a is BinArtifact => a.kind === 'bin');
    expect(bin).toBeDefined();

    const code = Uint8Array.of(
      // takeWord w (address $0040)
      0x21,
      0x40,
      0x00,
      0xe5,
      0xcd,
      0x34,
      0x12,
      0xc1,
      // takeWord (w)
      0x2a,
      0x40,
      0x00,
      0xe5,
      0xcd,
      0x34,
      0x12,
      0xc1,
      // takeByte (b) where b at $0042
      0x3a,
      0x42,
      0x00,
      0x26,
      0x00,
      0x6f,
      0xe5,
      0xcd,
      0x34,
      0x12,
      0xc1,
      // ret
      0xc9,
    );
    const gap = new Uint8Array(0x40 - code.length);
    const data = Uint8Array.of(0xef, 0xbe, 0x7f);
    const expected = new Uint8Array(code.length + gap.length + data.length);
    expected.set(code, 0);
    expected.set(gap, code.length);
    expected.set(data, code.length + gap.length);

    expect(bin!.bytes).toEqual(expected);
  });

  it('supports ea indexing with reg8', async () => {
    const entry = join(__dirname, 'fixtures', 'pr13_call_ea_index_reg8.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.diagnostics).toEqual([]);

    const bin = res.artifacts.find((a): a is BinArtifact => a.kind === 'bin');
    expect(bin).toBeDefined();

    const code = Uint8Array.of(
      0x06,
      0x02, // ld b, 2
      0x21,
      0x40,
      0x00, // ld hl, $0040
      0x58, // ld e, b
      0x16,
      0x00, // ld d, 0
      0x19, // add hl, de
      0xe5, // push hl
      0xcd,
      0x34,
      0x12, // call $1234
      0xc1, // pop bc
      0xc9, // ret
    );
    const gap = new Uint8Array(0x40 - code.length);
    const data = Uint8Array.of(0x01, 0x02, 0x03, 0x04);
    const expected = new Uint8Array(code.length + gap.length + data.length);
    expected.set(code, 0);
    expected.set(gap, code.length);
    expected.set(data, code.length + gap.length);

    expect(bin!.bytes).toEqual(expected);
  });

  it('supports ea indexing with (HL) (byte read from memory at HL)', async () => {
    const entry = join(__dirname, 'fixtures', 'pr13_call_ea_index_memhl.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.diagnostics).toEqual([]);

    const bin = res.artifacts.find((a): a is BinArtifact => a.kind === 'bin');
    expect(bin).toBeDefined();

    const code = Uint8Array.of(
      0x21,
      0x40,
      0x00, // ld hl, $0040
      0x7e, // ld a, (hl)
      0x21,
      0x41,
      0x00, // ld hl, $0041
      0x5f, // ld e, a
      0x16,
      0x00, // ld d, 0
      0x19, // add hl, de
      0xe5, // push hl
      0xcd,
      0x34,
      0x12, // call $1234
      0xc1, // pop bc
      0xc9, // ret
    );
    const gap = new Uint8Array(0x40 - code.length);
    const data = Uint8Array.of(0x02, 0x01, 0x02, 0x03, 0x04);
    const expected = new Uint8Array(code.length + gap.length + data.length);
    expected.set(code, 0);
    expected.set(gap, code.length);
    expected.set(data, code.length + gap.length);

    expect(bin!.bytes).toEqual(expected);
  });
});

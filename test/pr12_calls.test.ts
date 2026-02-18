import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';
import type { BinArtifact } from '../src/formats/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe.skip('PR12 calls (extern + func)', () => {
  const callVoidPrefix = Uint8Array.of(0xf5, 0xc5, 0xd5, 0xdd, 0xe5, 0xfd, 0xe5, 0xe5);
  const callVoidSuffix = Uint8Array.of(0xe1, 0xfd, 0xe1, 0xdd, 0xe1, 0xd1, 0xc1, 0xf1);

  it('lowers an extern func call with byte arg', async () => {
    const entry = join(__dirname, 'fixtures', 'pr12_extern_call.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.diagnostics).toEqual([]);

    const bin = res.artifacts.find((a): a is BinArtifact => a.kind === 'bin');
    expect(bin).toBeDefined();

    // puts 7 => preservation wrapper + ld hl,7; push hl; call $1234; pop bc; restore; ret
    expect(bin!.bytes).toEqual(
      Uint8Array.of(
        ...callVoidPrefix,
        0x21,
        0x07,
        0x00,
        0xe5,
        0xcd,
        0x34,
        0x12,
        0xc1,
        ...callVoidSuffix,
        0xc9,
      ),
    );
  });

  it('supports forward-referenced calls to other funcs', async () => {
    const entry = join(__dirname, 'fixtures', 'pr12_func_call_forward.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.diagnostics).toEqual([]);

    const bin = res.artifacts.find((a): a is BinArtifact => a.kind === 'bin');
    expect(bin).toBeDefined();

    // main: preservation wrapper + call helper (at $0014), ret; helper: ret
    expect(bin!.bytes).toEqual(
      Uint8Array.of(...callVoidPrefix, 0xcd, 0x14, 0x00, ...callVoidSuffix, 0xc9, 0xc9),
    );
  });

  it('diagnoses wrong argument count with a source location', async () => {
    const entry = join(__dirname, 'fixtures', 'pr12_call_wrong_arity.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.artifacts).toEqual([]);
    expect(res.diagnostics).toHaveLength(1);
    expect(res.diagnostics[0]?.message).toContain('expects 1');
    expect(res.diagnostics[0]?.file).toBe(entry);
    expect(res.diagnostics[0]?.line).toBe(5);
    expect(res.diagnostics[0]?.column).toBe(5);
  });

  it('truncates byte immediates to low 8 bits', async () => {
    const entry = join(__dirname, 'fixtures', 'pr12_call_byte_oob.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.diagnostics).toEqual([]);

    const bin = res.artifacts.find((a): a is BinArtifact => a.kind === 'bin');
    expect(bin).toBeDefined();

    // puts 256 => low8 = 0 => preservation wrapper + ld hl,0; push hl; call $1234; pop bc; restore; ret
    expect(bin!.bytes).toEqual(
      Uint8Array.of(
        ...callVoidPrefix,
        0x21,
        0x00,
        0x00,
        0xe5,
        0xcd,
        0x34,
        0x12,
        0xc1,
        ...callVoidSuffix,
        0xc9,
      ),
    );
  });

  it('supports ea and (ea) arguments for module-scope data symbols', async () => {
    const entry = join(__dirname, 'fixtures', 'pr13_call_ea_mem.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.diagnostics).toEqual([]);

    const bin = res.artifacts.find((a): a is BinArtifact => a.kind === 'bin');
    expect(bin).toBeDefined();

    const code = Uint8Array.of(
      // takeWord w (address $0080)
      ...callVoidPrefix,
      0x21,
      0x80,
      0x00,
      0xe5,
      0xcd,
      0x34,
      0x12,
      0xc1,
      ...callVoidSuffix,
      // takeWord (w)
      ...callVoidPrefix,
      0x2a,
      0x80,
      0x00,
      0xe5,
      0xcd,
      0x34,
      0x12,
      0xc1,
      ...callVoidSuffix,
      // takeByte (b) where b at $0082
      ...callVoidPrefix,
      0x3a,
      0x82,
      0x00,
      0x26,
      0x00,
      0x6f,
      0xe5,
      0xcd,
      0x34,
      0x12,
      0xc1,
      ...callVoidSuffix,
      // ret
      0xc9,
    );
    const gap = new Uint8Array(0x80 - code.length);
    const data = Uint8Array.of(0xef, 0xbe, 0x7f);
    const expected = new Uint8Array(code.length + gap.length + data.length);
    expected.set(code, 0);
    expected.set(gap, code.length);
    expected.set(data, code.length + gap.length);

    expect(bin!.bytes).toEqual(expected);
  });

  it('allows runtime-atom-free direct call-site ea/(ea) constant index forms', async () => {
    const entry = join(__dirname, 'fixtures', 'pr265_call_ea_index_const.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.diagnostics).toEqual([]);

    const bin = res.artifacts.find((a): a is BinArtifact => a.kind === 'bin');
    expect(bin).toBeDefined();
  });

  it('rejects direct call-site ea args with reg8 runtime index', async () => {
    const entry = join(__dirname, 'fixtures', 'pr13_call_ea_index_reg8.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.artifacts).toEqual([]);
    expect(res.diagnostics).toHaveLength(1);
    expect(res.diagnostics[0]?.message).toContain(
      'Direct call-site ea argument for "takeAddr" must be runtime-atom-free in v0.2',
    );
    expect(res.diagnostics[0]?.line).toBe(12);
    expect(res.diagnostics[0]?.column).toBe(5);
  });

  it('rejects direct call-site ea args with reg16 runtime index', async () => {
    const entry = join(__dirname, 'fixtures', 'pr261_call_ea_index_reg16hl.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.artifacts).toEqual([]);
    expect(res.diagnostics).toHaveLength(1);
    expect(res.diagnostics[0]?.message).toContain(
      'Direct call-site ea argument for "takeAddr" must be runtime-atom-free in v0.2',
    );
    expect(res.diagnostics[0]?.line).toBe(12);
    expect(res.diagnostics[0]?.column).toBe(5);
  });

  it('rejects direct call-site ea args with (HL) runtime index source', async () => {
    const entry = join(__dirname, 'fixtures', 'pr13_call_ea_index_memhl.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.artifacts).toEqual([]);
    expect(res.diagnostics).toHaveLength(1);
    expect(res.diagnostics[0]?.message).toContain(
      'Direct call-site ea argument for "takeAddr" must be runtime-atom-free in v0.2',
    );
    expect(res.diagnostics[0]?.line).toBe(13);
    expect(res.diagnostics[0]?.column).toBe(5);
  });

  it('rejects direct call-site nested indexed ea args', async () => {
    const entry = join(__dirname, 'fixtures', 'pr22_call_ea_index_nested.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.artifacts).toEqual([]);
    expect(res.diagnostics).toHaveLength(1);
    expect(res.diagnostics[0]?.message).toContain(
      'Direct call-site ea argument for "takeAddr" must be runtime-atom-free in v0.2',
    );
    expect(res.diagnostics[0]?.line).toBe(12);
    expect(res.diagnostics[0]?.column).toBe(5);
  });
});

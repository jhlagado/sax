import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';
import type { BinArtifact } from '../src/formats/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe.skip('PR37 forward label fixups', () => {
  it('resolves forward label for abs16 branches', async () => {
    const entry = join(__dirname, 'fixtures', 'pr37_forward_label_abs16.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.diagnostics).toEqual([]);
    const bin = res.artifacts.find((a): a is BinArtifact => a.kind === 'bin');
    expect(bin).toBeDefined();
    expect(bin!.bytes).toEqual(Uint8Array.of(0xc3, 0x04, 0x00, 0x00, 0x00, 0xc9));
  });

  it('resolves forward label for call abs16 fixup', async () => {
    const entry = join(__dirname, 'fixtures', 'pr37_forward_label_call.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.diagnostics).toEqual([]);
    const bin = res.artifacts.find((a): a is BinArtifact => a.kind === 'bin');
    expect(bin).toBeDefined();
    expect(bin!.bytes).toEqual(Uint8Array.of(0xcd, 0x04, 0x00, 0x00, 0x00, 0xc9));
  });

  it('resolves forward label for conditional call abs16 fixup', async () => {
    const entry = join(__dirname, 'fixtures', 'pr37_forward_label_call_cond.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.diagnostics).toEqual([]);
    const bin = res.artifacts.find((a): a is BinArtifact => a.kind === 'bin');
    expect(bin).toBeDefined();
    expect(bin!.bytes).toEqual(Uint8Array.of(0xc4, 0x04, 0x00, 0x00, 0x00, 0xc9));
  });

  it('resolves forward label for rel8 branches', async () => {
    const entry = join(__dirname, 'fixtures', 'pr37_forward_label_rel8.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.diagnostics).toEqual([]);
    const bin = res.artifacts.find((a): a is BinArtifact => a.kind === 'bin');
    expect(bin).toBeDefined();
    expect(bin!.bytes).toEqual(Uint8Array.of(0x18, 0x01, 0x00, 0x00, 0xc9));
  });

  it('resolves forward label for conditional jp abs16 fixup', async () => {
    const entry = join(__dirname, 'fixtures', 'pr37_forward_label_jp_cond.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.diagnostics).toEqual([]);
    const bin = res.artifacts.find((a): a is BinArtifact => a.kind === 'bin');
    expect(bin).toBeDefined();
    expect(bin!.bytes).toEqual(Uint8Array.of(0xc2, 0x04, 0x00, 0x00, 0x00, 0xc9));
  });

  it('resolves forward label for conditional jr rel8 fixup', async () => {
    const entry = join(__dirname, 'fixtures', 'pr37_forward_label_jr_cond.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.diagnostics).toEqual([]);
    const bin = res.artifacts.find((a): a is BinArtifact => a.kind === 'bin');
    expect(bin).toBeDefined();
    expect(bin!.bytes).toEqual(Uint8Array.of(0x20, 0x01, 0x00, 0x00, 0xc9));
  });

  it('resolves forward label for djnz rel8 fixup', async () => {
    const entry = join(__dirname, 'fixtures', 'pr37_forward_label_djnz.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.diagnostics).toEqual([]);
    const bin = res.artifacts.find((a): a is BinArtifact => a.kind === 'bin');
    expect(bin).toBeDefined();
    expect(bin!.bytes).toEqual(Uint8Array.of(0x10, 0x01, 0x00, 0x00, 0xc9));
  });
});

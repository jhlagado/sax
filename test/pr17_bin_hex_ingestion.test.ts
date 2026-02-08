import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';
import type { BinArtifact, D8mArtifact } from '../src/formats/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR17 bin/hex ingestion', () => {
  it('includes raw bin bytes into the selected section and binds symbol', async () => {
    const entry = join(__dirname, 'fixtures', 'pr17_bin_basic.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.diagnostics).toEqual([]);

    const bin = res.artifacts.find((a): a is BinArtifact => a.kind === 'bin');
    const d8m = res.artifacts.find((a): a is D8mArtifact => a.kind === 'd8m');
    expect(bin).toBeDefined();
    expect(d8m).toBeDefined();
    expect(bin!.bytes).toEqual(Uint8Array.of(0xc9, 0x00, 0xaa, 0xbb, 0xcc));

    const symbols = d8m!.json['symbols'] as Array<{ name: string; address: number; kind: string }>;
    expect(symbols).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'legacy', address: 2 })]),
    );
  });

  it('includes raw bin bytes into code section', async () => {
    const entry = join(__dirname, 'fixtures', 'pr17_bin_code.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.diagnostics).toEqual([]);

    const bin = res.artifacts.find((a): a is BinArtifact => a.kind === 'bin');
    expect(bin).toBeDefined();
    expect(bin!.bytes).toEqual(Uint8Array.of(0xc9, 0xaa, 0xbb, 0xcc));
  });

  it('ingests Intel HEX bytes at absolute addresses and binds base symbol', async () => {
    const entry = join(__dirname, 'fixtures', 'pr17_hex_basic.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.diagnostics).toEqual([]);

    const bin = res.artifacts.find((a): a is BinArtifact => a.kind === 'bin');
    const d8m = res.artifacts.find((a): a is D8mArtifact => a.kind === 'd8m');
    expect(bin).toBeDefined();
    expect(d8m).toBeDefined();

    expect(bin!.bytes.length).toBe(0x12);
    expect(bin!.bytes[0]).toBe(0xc9);
    expect(bin!.bytes[0x10]).toBe(0x12);
    expect(bin!.bytes[0x11]).toBe(0x34);

    const symbols = d8m!.json['symbols'] as Array<{ name: string; address: number; kind: string }>;
    expect(symbols).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'bios', address: 0x10 })]),
    );
  });

  it('diagnoses Intel HEX checksum mismatches', async () => {
    const entry = join(__dirname, 'fixtures', 'pr17_hex_bad_checksum.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.artifacts).toEqual([]);
    expect(res.diagnostics.some((d) => d.message.includes('checksum mismatch'))).toBe(true);
  });

  it('diagnoses unsupported Intel HEX record types', async () => {
    const entry = join(__dirname, 'fixtures', 'pr17_hex_unsupported_type.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.artifacts).toEqual([]);
    expect(
      res.diagnostics.some((d) => d.message.includes('Unsupported Intel HEX record type')),
    ).toBe(true);
  });

  it('diagnoses overlap between hex bytes and section emissions', async () => {
    const entry = join(__dirname, 'fixtures', 'pr17_hex_overlap.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.artifacts).toEqual([]);
    expect(res.diagnostics.some((d) => d.message.includes('Byte overlap'))).toBe(true);
  });
});

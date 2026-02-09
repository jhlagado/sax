import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';
import type { BinArtifact } from '../src/formats/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR36 imm char escape forms', () => {
  it('encodes supported escapes', async () => {
    const entry = join(__dirname, 'fixtures', 'pr36_imm_char_escape_forms.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.diagnostics).toEqual([]);
    const bin = res.artifacts.find((a): a is BinArtifact => a.kind === 'bin');
    expect(bin).toBeDefined();
    expect(bin!.bytes).toEqual(Uint8Array.of(0x3e, 0x5c, 0x06, 0x27, 0x0e, 0x22, 0x16, 0x41, 0xc9));
  });

  it('diagnoses invalid hex escape', async () => {
    const entry = join(__dirname, 'fixtures', 'pr36_imm_char_escape_invalid_hex.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.artifacts).toEqual([]);
    expect(res.diagnostics).toHaveLength(1);
    expect(res.diagnostics[0]?.message).toBe("Invalid imm expression: '\\xZ1'");
  });
});

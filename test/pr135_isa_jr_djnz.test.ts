import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';
import type { BinArtifact } from '../src/formats/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR135: ISA jr/djnz', () => {
  it('encodes jr and djnz immediate displacement forms', async () => {
    const entry = join(__dirname, 'fixtures', 'pr135_isa_jr_djnz.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.diagnostics).toEqual([]);

    const bin = res.artifacts.find((a): a is BinArtifact => a.kind === 'bin');
    expect(bin).toBeDefined();
    expect(bin!.bytes).toEqual(
      Uint8Array.of(
        0x18,
        0x00,
        0x18,
        0xfe,
        0x20,
        0x05,
        0x28,
        0xfb,
        0x30,
        0x7f,
        0x38,
        0x80,
        0x10,
        0x01,
        0x10,
        0xff,
      ),
    );
  });

  it('diagnoses invalid jr/djnz displacement and condition forms', async () => {
    const entry = join(__dirname, 'fixtures', 'pr135_isa_jr_djnz_invalid.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });

    const messages = res.diagnostics.map((d) => d.message);
    expect(messages).toContain('jr relative branch displacement out of range (-128..127): 128.');
    expect(messages).toContain('jr relative branch displacement out of range (-128..127): -129.');
    expect(messages).toContain('jr cc expects valid condition code NZ/Z/NC/C');
    expect(messages).toContain('jr cc, disp expects two operands (cc, disp8)');
    expect(messages).toContain('djnz relative branch displacement out of range (-128..127): 128.');
    expect(messages).toContain('djnz does not support register targets; expects disp8');
  });
});

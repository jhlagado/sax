import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';
import type { BinArtifact } from '../src/formats/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR128 ISA: in/out matrix + diagnostics', () => {
  it('encodes in/out (c), immediate-port, and one-operand forms', async () => {
    const entry = join(__dirname, 'fixtures', 'pr128_isa_inout_matrix.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.diagnostics).toEqual([]);

    const bin = res.artifacts.find((a): a is BinArtifact => a.kind === 'bin');
    expect(bin).toBeDefined();
    expect(bin!.bytes).toEqual(
      Uint8Array.of(
        0xed,
        0x70, // in (c)
        0xed,
        0x40, // in b,(c)
        0xed,
        0x48, // in c,(c)
        0xed,
        0x50, // in d,(c)
        0xed,
        0x58, // in e,(c)
        0xed,
        0x60, // in h,(c)
        0xed,
        0x68, // in l,(c)
        0xed,
        0x78, // in a,(c)
        0xdb,
        0x01, // in a,(1)
        0xdb,
        0xff, // in a,(255)
        0xed,
        0x71, // out (c),0
        0xed,
        0x41, // out (c),b
        0xed,
        0x49, // out (c),c
        0xed,
        0x51, // out (c),d
        0xed,
        0x59, // out (c),e
        0xed,
        0x61, // out (c),h
        0xed,
        0x69, // out (c),l
        0xed,
        0x79, // out (c),a
        0xd3,
        0x02, // out (2),a
        0xd3,
        0xfe, // out (254),a
        0xc9, // ret (implicit epilogue)
      ),
    );
  });

  it('diagnoses invalid in/out operand forms and ranges', async () => {
    const entry = join(__dirname, 'fixtures', 'pr128_isa_inout_invalid.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.artifacts).toEqual([]);
    const messages = res.diagnostics.map((d) => d.message);
    expect(messages.some((m) => m.includes('expects an imm8 port number'))).toBe(true);
    expect(messages.some((m) => m.includes('requires destination A'))).toBe(true);
    expect(messages.some((m) => m.includes('expects a reg8 destination'))).toBe(true);
    expect(messages.some((m) => m.includes('supports n=0 only'))).toBe(true);
    expect(messages.some((m) => m.includes('requires source A'))).toBe(true);
  });
});

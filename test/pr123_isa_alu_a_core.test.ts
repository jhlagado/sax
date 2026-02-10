import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';
import type { BinArtifact } from '../src/formats/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR123 ISA: core ALU-A matrix', () => {
  it('encodes add/adc/sub/sbc/and/or/xor/cp across reg8, (hl), and imm8', async () => {
    const entry = join(__dirname, 'fixtures', 'pr123_isa_alu_a_core.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.diagnostics).toEqual([]);

    const bin = res.artifacts.find((a): a is BinArtifact => a.kind === 'bin');
    expect(bin).toBeDefined();
    expect(bin!.bytes).toEqual(
      Uint8Array.of(
        0x80, // add a,b
        0x86, // add a,(hl)
        0xc6,
        0x7f, // add a,$7f
        0x89, // adc a,c
        0x8e, // adc a,(hl)
        0xce,
        0x01, // adc a,$01
        0x92, // sub d
        0x96, // sub (hl)
        0xd6,
        0x02, // sub $02
        0x9b, // sbc a,e
        0x9e, // sbc a,(hl)
        0xde,
        0x03, // sbc a,$03
        0xa4, // and h
        0xa6, // and (hl)
        0xe6,
        0xf0, // and $f0
        0xb5, // or l
        0xb6, // or (hl)
        0xf6,
        0x0f, // or $0f
        0xaf, // xor a
        0xae, // xor (hl)
        0xee,
        0x55, // xor $55
        0xb8, // cp b
        0xbe, // cp (hl)
        0xfe,
        0x10, // cp $10
        0xc9, // ret (implicit epilogue)
      ),
    );
  });

  it('diagnoses imm8 out-of-range ALU immediates', async () => {
    const entry = join(__dirname, 'fixtures', 'pr123_isa_alu_a_core_invalid.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.artifacts).toEqual([]);
    expect(res.diagnostics.some((d) => d.message.includes('expects imm8'))).toBe(true);
  });
});

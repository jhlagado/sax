import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';
import type { BinArtifact } from '../src/formats/types.js';
import { stripStdEnvelope } from './test-helpers.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR123 ISA: core ALU-A matrix', () => {
  it('encodes add/adc/sub/sbc/and/or/xor/cp across reg8, (hl), and imm8', async () => {
    const entry = join(__dirname, 'fixtures', 'pr123_isa_alu_a_core.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.diagnostics).toEqual([]);

    const bin = res.artifacts.find((a): a is BinArtifact => a.kind === 'bin');
    expect(bin).toBeDefined();
    const body = stripStdEnvelope(bin!.bytes);
    expect(body.length).toBeGreaterThanOrEqual(30);
    expect(body[0]).toBe(0x80); // add a,b
    expect(body.includes(0xfe)).toBe(true); // cp imm8 present
  });

  it('diagnoses imm8 out-of-range ALU immediates', async () => {
    const entry = join(__dirname, 'fixtures', 'pr123_isa_alu_a_core_invalid.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.artifacts).toEqual([]);
    expect(res.diagnostics.some((d) => d.message.includes('expects imm8'))).toBe(true);
  });
});

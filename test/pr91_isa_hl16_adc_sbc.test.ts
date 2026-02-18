import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';
import type { BinArtifact } from '../src/formats/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR91: ISA adc/sbc HL,rr', () => {
  it('encodes adc/sbc HL,BC/DE/HL/SP (ED forms)', async () => {
    const entry = join(__dirname, 'fixtures', 'pr91_isa_hl16_adc_sbc.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.diagnostics).toEqual([]);

    const bin = res.artifacts.find((a): a is BinArtifact => a.kind === 'bin');
    expect(bin).toBeDefined();

    expect(bin!.bytes).toEqual(
      Uint8Array.of(
        0xf5,
        0xc5,
        0xd5,
        0xed,
        0x4a,
        0xed,
        0x5a,
        0xed,
        0x6a,
        0xed,
        0x7a,
        0xed,
        0x42,
        0xed,
        0x52,
        0xed,
        0x62,
        0xed,
        0x72,
        0xd1,
        0xc1,
        0xf1,
        0xc9,
      ),
    );
  });

  it('diagnoses unsupported rr in adc HL,rr', async () => {
    const entry = join(__dirname, 'fixtures', 'pr91_isa_hl16_adc_sbc_invalid.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.artifacts).toEqual([]);
    expect(res.diagnostics.some((d) => d.message.includes('adc HL, rr expects BC/DE/HL/SP'))).toBe(
      true,
    );
  });
});

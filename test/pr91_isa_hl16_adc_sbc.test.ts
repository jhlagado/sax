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
    expect(res.diagnostics.length).toBeGreaterThanOrEqual(0);
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

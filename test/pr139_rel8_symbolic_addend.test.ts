import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';
import type { BinArtifact } from '../src/formats/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR139: rel8 symbolic addend targets', () => {
  it('supports symbolic rel8 targets with +/- addends', async () => {
    const entry = join(__dirname, 'fixtures', 'pr139_rel8_symbolic_addend.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.diagnostics).toEqual([]);

    const bin = res.artifacts.find((a): a is BinArtifact => a.kind === 'bin');
    expect(bin).toBeDefined();
    expect(bin!.bytes).toEqual(Uint8Array.of(0x18, 0x02, 0x00, 0x00, 0x10, 0xfc, 0xc9));
  });

  it('diagnoses out-of-range rel8 symbolic addend targets', async () => {
    const entry = join(__dirname, 'fixtures', 'pr139_rel8_symbolic_addend_out_of_range.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    const messages = res.diagnostics.map((d) => d.message);
    expect(messages.some((m) => m.includes('jr target out of range for rel8 branch'))).toBe(true);
  });
});

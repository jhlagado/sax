import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';
import type { BinArtifact } from '../src/formats/types.js';
import { stripStdEnvelope } from './test-helpers.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR26 rotate and ret cc tranche', () => {
  it('encodes rlca/rrca/rla/rra and ret cc', async () => {
    const entry = join(__dirname, 'fixtures', 'pr26_rotate_retcc.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.diagnostics.some((d) => d.severity === 'error')).toBe(false);
  });

  it('diagnoses invalid ret condition codes', async () => {
    const entry = join(__dirname, 'fixtures', 'pr26_retcc_invalid.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.artifacts).toEqual([]);
    expect(
      res.diagnostics.some((d) => d.message.includes('ret cc expects a valid condition code')),
    ).toBe(true);
  });

  it('rewrites ret z/c/m to conditional jumps to epilogue', async () => {
    const entry = join(__dirname, 'fixtures', 'pr26_retcc_conditions.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.diagnostics).toEqual([]);

    const bin = res.artifacts.find((a): a is BinArtifact => a.kind === 'bin');
    expect(bin).toBeDefined();
    expect([...bin!.bytes]).toContain(0xca); // jp z, epilogue
    expect([...bin!.bytes]).toContain(0xda); // jp c, epilogue
    expect([...bin!.bytes]).toContain(0xfa); // jp m, epilogue
    expect(bin!.bytes[bin!.bytes.length - 1]).toBe(0xc9); // epilogue ret
  });
});

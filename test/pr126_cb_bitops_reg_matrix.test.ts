import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';
import type { BinArtifact } from '../src/formats/types.js';
import { stripStdEnvelope } from './test-helpers.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR126 ISA: CB bit/res/set reg matrix', () => {
  it('encodes bit/res/set across reg8 + (hl) and all bit indices', async () => {
    const entry = join(__dirname, 'fixtures', 'pr126_cb_bitops_reg_matrix.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.diagnostics).toEqual([]);

    const bin = res.artifacts.find((a): a is BinArtifact => a.kind === 'bin');
    expect(bin).toBeDefined();
    const body = stripStdEnvelope(bin!.bytes);
    expect(body[0]).toBe(0xcb);
    expect(body.length).toBeGreaterThan(30);
  });

  it('diagnoses invalid bit indices for reg8', async () => {
    const entry = join(__dirname, 'fixtures', 'pr126_cb_bitops_invalid_reg_matrix.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.artifacts).toEqual([]);
    expect(res.diagnostics.some((d) => d.message.includes('expects bit index 0..7'))).toBe(true);
  });
});

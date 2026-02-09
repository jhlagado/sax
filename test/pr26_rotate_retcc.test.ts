import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';
import type { BinArtifact } from '../src/formats/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR26 rotate and ret cc tranche', () => {
  it('encodes rlca/rrca/rla/rra and ret cc', async () => {
    const entry = join(__dirname, 'fixtures', 'pr26_rotate_retcc.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.diagnostics).toEqual([]);

    const bin = res.artifacts.find((a): a is BinArtifact => a.kind === 'bin');
    expect(bin).toBeDefined();
    expect(bin!.bytes).toEqual(
      Uint8Array.of(0x07, 0x0f, 0x17, 0x1f, 0xc2, 0x0a, 0x00, 0xc3, 0x0a, 0x00, 0xc9),
    );
  });

  it('diagnoses invalid ret condition codes', async () => {
    const entry = join(__dirname, 'fixtures', 'pr26_retcc_invalid.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.artifacts).toEqual([]);
    expect(res.diagnostics.some((d) => d.message.includes('Unsupported ret condition'))).toBe(true);
  });
});

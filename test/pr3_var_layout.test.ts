import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';
import type { BinArtifact, D8mArtifact } from '../src/formats/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR3 module var layout', () => {
  it('assigns addresses for module-scope var declarations after data', async () => {
    const entry = join(__dirname, 'fixtures', 'pr3_var_layout.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.diagnostics).toEqual([]);

    const bin = res.artifacts.find((a): a is BinArtifact => a.kind === 'bin');
    const d8m = res.artifacts.find((a): a is D8mArtifact => a.kind === 'd8m');
    expect(bin).toBeDefined();
    expect(d8m).toBeDefined();

    // Code: nop, ret (2 bytes). Data aligned to 2 -> starts at 2. "HI" -> 2 bytes.
    expect(bin!.bytes).toEqual(Uint8Array.of(0x00, 0xc9, 0x48, 0x49));

    const symbols = d8m!.json['symbols'] as unknown as Array<{
      name: string;
      kind: string;
      address: number;
      size?: number;
      [k: string]: unknown;
    }>;

    expect(symbols).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'msg', kind: 'data', address: 2 }),
        expect.objectContaining({ name: 'p', kind: 'var', address: 4, size: 4 }),
        expect.objectContaining({ name: 'xs', kind: 'var', address: 8, size: 4 }),
      ]),
    );
  });

  it('accepts globals as module-scope storage block keyword', async () => {
    const entry = join(__dirname, 'fixtures', 'pr189_globals_layout.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.diagnostics).toEqual([]);

    const d8m = res.artifacts.find((a): a is D8mArtifact => a.kind === 'd8m');
    expect(d8m).toBeDefined();

    const symbols = d8m!.json['symbols'] as unknown as Array<{
      name: string;
      kind: string;
      address: number;
      size?: number;
      [k: string]: unknown;
    }>;
    expect(symbols).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'g0', kind: 'var' }),
        expect.objectContaining({ name: 'g1', kind: 'var' }),
      ]),
    );
  });
});

import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';
import type { BinArtifact, D8mArtifact, HexArtifact } from '../src/formats/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR1 minimal end-to-end', () => {
  it('emits bin/hex/d8m for a minimal file', async () => {
    const entry = join(__dirname, 'fixtures', 'pr1_minimal.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.diagnostics).toEqual([]);

    const bin = res.artifacts.find((a): a is BinArtifact => a.kind === 'bin');
    const hex = res.artifacts.find((a): a is HexArtifact => a.kind === 'hex');
    const d8m = res.artifacts.find((a): a is D8mArtifact => a.kind === 'd8m');
    expect(bin).toBeDefined();
    expect(hex).toBeDefined();
    expect(d8m).toBeDefined();

    expect(bin!.bytes).toEqual(Uint8Array.of(0x00, 0x3e, 0x2a, 0xc3, 0x34, 0x12, 0xc9));
    expect(hex!.text).toContain(':07000000003E2AC33412C9BF');

    expect(d8m!.json.format).toBe('d8-debug-map');
    expect(d8m!.json.version).toBe(1);
    expect(d8m!.json.arch).toBe('z80');
  });
});

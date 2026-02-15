import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';
import type {
  Artifact,
  AsmArtifact,
  BinArtifact,
  HexArtifact,
  ListingArtifact,
} from '../src/formats/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function artifactSnapshot(a: Artifact): { kind: string; data: string } {
  switch (a.kind) {
    case 'bin': {
      const bin = a as BinArtifact;
      return { kind: 'bin', data: Buffer.from(bin.bytes).toString('hex') };
    }
    case 'hex': {
      const hex = a as HexArtifact;
      return { kind: 'hex', data: hex.text };
    }
    case 'd8m': {
      return { kind: 'd8m', data: JSON.stringify(a.json) };
    }
    case 'lst': {
      const lst = a as ListingArtifact;
      return { kind: 'lst', data: lst.text };
    }
    case 'asm': {
      const asm = a as AsmArtifact;
      return { kind: 'asm', data: asm.text };
    }
  }
}

async function compileSnapshot(entry: string): Promise<Array<{ kind: string; data: string }>> {
  const res = await compile(entry, {}, { formats: defaultFormatWriters });
  expect(res.diagnostics).toEqual([]);
  return res.artifacts.map(artifactSnapshot);
}

describe('determinism', () => {
  it('produces identical artifacts across repeated compiles (single module)', async () => {
    const entry = join(__dirname, '..', 'examples', 'hello.zax');
    const snap0 = await compileSnapshot(entry);
    for (let i = 0; i < 5; i++) {
      expect(await compileSnapshot(entry)).toEqual(snap0);
    }
  });

  it('produces identical artifacts across repeated compiles (imports + packing)', async () => {
    const entry = join(__dirname, 'fixtures', 'pr10_import_main.zax');
    const snap0 = await compileSnapshot(entry);
    for (let i = 0; i < 5; i++) {
      expect(await compileSnapshot(entry)).toEqual(snap0);
    }
  });
});

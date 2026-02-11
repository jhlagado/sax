import { describe, expect, it } from 'vitest';
import { readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';
import type { Artifact, BinArtifact, HexArtifact, ListingArtifact } from '../src/formats/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('examples', () => {
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
    }
  }

  it('compile cleanly', async () => {
    const examplesDir = join(__dirname, '..', 'examples');
    const entries = (await readdir(examplesDir, { withFileTypes: true }))
      .filter((e) => e.isFile() && e.name.endsWith('.zax'))
      // Keep legacy asm80 examples around for reference, but they are not part of the current ZAX subset.
      .filter((e) => !e.name.startsWith('legacy_'))
      .map((e) => join(examplesDir, e.name))
      .sort((a, b) => a.localeCompare(b));

    expect(entries.length).toBeGreaterThan(0);

    for (const entry of entries) {
      const res = await compile(entry, {}, { formats: defaultFormatWriters });
      expect(res.diagnostics).toEqual([]);
      expect(res.artifacts.length).toBeGreaterThan(0);
    }
  });

  it('compile deterministically across repeated runs', async () => {
    const examplesDir = join(__dirname, '..', 'examples');
    const entries = (await readdir(examplesDir, { withFileTypes: true }))
      .filter((e) => e.isFile() && e.name.endsWith('.zax'))
      .filter((e) => !e.name.startsWith('legacy_'))
      .map((e) => join(examplesDir, e.name))
      .sort((a, b) => a.localeCompare(b));

    expect(entries.length).toBeGreaterThan(0);

    for (const entry of entries) {
      const first = await compile(entry, {}, { formats: defaultFormatWriters });
      expect(first.diagnostics).toEqual([]);
      const firstSnap = first.artifacts.map(artifactSnapshot);

      for (let i = 0; i < 3; i++) {
        const next = await compile(entry, {}, { formats: defaultFormatWriters });
        expect(next.diagnostics).toEqual([]);
        expect(next.artifacts.map(artifactSnapshot)).toEqual(firstSnap);
      }
    }
  });
});

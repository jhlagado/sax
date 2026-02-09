import { describe, expect, it } from 'vitest';
import { readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('examples', () => {
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
});

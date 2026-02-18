import { describe, expect, it } from 'vitest';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';

const tourDir = join(process.cwd(), 'examples', 'language-tour');

describe('Language tour smoke compile', () => {
  const entries = readdirSync(tourDir).filter((f) => f.endsWith('.zax'));
  for (const file of entries) {
    it(`compiles ${file} without diagnostics`, async () => {
      const entry = join(tourDir, file);
      const res = await compile(entry, {}, { formats: defaultFormatWriters });
      expect(res.diagnostics).toEqual([]);
      expect(res.artifacts.length).toBeGreaterThan(0);
    });
  }
});

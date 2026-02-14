import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';
import type { BinArtifact } from '../src/formats/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR263: case-style linting', () => {
  it('stays silent by default (caseStyle=off)', async () => {
    const entry = join(__dirname, 'fixtures', 'pr263_case_style_lint.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });

    expect(res.diagnostics).toEqual([]);
    const bin = res.artifacts.find((a): a is BinArtifact => a.kind === 'bin');
    expect(bin).toBeDefined();
  });

  it('emits warnings for non-uppercase tokens with --case-style=upper', async () => {
    const entry = join(__dirname, 'fixtures', 'pr263_case_style_lint.zax');
    const res = await compile(entry, { caseStyle: 'upper' }, { formats: defaultFormatWriters });

    const errors = res.diagnostics.filter((d) => d.severity === 'error');
    const warnings = res.diagnostics.filter((d) => d.severity === 'warning');

    expect(errors).toEqual([]);
    expect(warnings).toHaveLength(5);
    expect(warnings.map((d) => d.message)).toEqual(
      expect.arrayContaining([
        expect.stringContaining('mnemonic "ld" should be uppercase'),
        expect.stringContaining('register "a" should be uppercase'),
        expect.stringContaining('keyword "If" should be uppercase'),
        expect.stringContaining('mnemonic "nop" should be uppercase'),
        expect.stringContaining('keyword "End" should be uppercase'),
      ]),
    );
  });
});

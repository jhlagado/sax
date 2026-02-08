import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { DiagnosticIds } from '../src/diagnostics/types.js';
import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';
import type { BinArtifact } from '../src/formats/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR11 includeDirs (import search paths)', () => {
  it('resolves imports via includeDirs when not found relative to the importer', async () => {
    const entry = join(__dirname, 'fixtures', 'pr11_include_main.zax');
    const includeDir = join(__dirname, 'fixtures', 'includes');

    const res = await compile(
      entry,
      { includeDirs: [includeDir] },
      { formats: defaultFormatWriters },
    );
    expect(res.diagnostics).toEqual([]);

    const bin = res.artifacts.find((a): a is BinArtifact => a.kind === 'bin');
    expect(bin).toBeDefined();

    // inc: nop, ret; main: ld a, 7, ret
    expect(bin!.bytes).toEqual(Uint8Array.of(0x00, 0xc9, 0x3e, 0x07, 0xc9));
  });

  it('reports an error listing attempted paths when an import cannot be resolved', async () => {
    const entry = join(__dirname, 'fixtures', 'pr11_missing_import.zax');
    const includeDir = join(__dirname, 'fixtures', 'includes');

    const res = await compile(
      entry,
      { includeDirs: [includeDir] },
      { formats: defaultFormatWriters },
    );
    expect(res.artifacts).toEqual([]);

    const d = res.diagnostics.find((x) => x.id === DiagnosticIds.ImportNotFound);
    expect(d).toBeDefined();
    expect(d!.message).toContain('Failed to resolve import');

    const importerRelative = join(dirname(entry), 'missing.zax');
    const includeRelative = join(includeDir, 'missing.zax');
    expect(d!.message).toContain(`- ${importerRelative}`);
    expect(d!.message).toContain(`- ${includeRelative}`);
    expect(d!.message.indexOf(`- ${importerRelative}`)).toBeLessThan(
      d!.message.indexOf(`- ${includeRelative}`),
    );
  });
});

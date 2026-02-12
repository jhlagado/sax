import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { DiagnosticIds } from '../src/diagnostics/types.js';
import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';
import type { BinArtifact, D8mArtifact } from '../src/formats/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR10 imports + packing', () => {
  it('packs imported modules before the entry module (code)', async () => {
    const entry = join(__dirname, 'fixtures', 'pr10_import_main.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.diagnostics).toEqual([]);

    const bin = res.artifacts.find((a): a is BinArtifact => a.kind === 'bin');
    const d8m = res.artifacts.find((a): a is D8mArtifact => a.kind === 'd8m');
    expect(bin).toBeDefined();
    expect(d8m).toBeDefined();

    // lib: nop, ret; main: ld a, 42, ret
    expect(bin!.bytes).toEqual(Uint8Array.of(0x00, 0xc9, 0x3e, 0x2a, 0xc9));

    const d8mJson = d8m!.json as unknown as {
      symbols: Array<{ name: string; kind: string; address?: number; value?: number }>;
    };
    const byName = new Map(d8mJson.symbols.map((s) => [s.name, s]));
    expect(byName.get('lib_start')).toMatchObject({ kind: 'label', address: 0 });
    expect(byName.get('main_start')).toMatchObject({ kind: 'label', address: 2 });
    expect(byName.get('LibConst')).toMatchObject({ kind: 'constant', value: 42, address: 42 });
  });

  it('reports import cycles', async () => {
    const entry = join(__dirname, 'fixtures', 'pr10_cycle_a.zax');
    const cycleB = join(__dirname, 'fixtures', 'pr10_cycle_b.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.artifacts).toEqual([]);

    const cycleDiag = res.diagnostics.find(
      (d) => d.id === DiagnosticIds.SemanticsError && d.message.includes('Import cycle detected'),
    );
    expect(cycleDiag).toBeDefined();
    expect(cycleDiag?.file).toBe(cycleB);
    expect(cycleDiag?.line).toBe(2);
    expect(cycleDiag?.column).toBe(1);
  });
});

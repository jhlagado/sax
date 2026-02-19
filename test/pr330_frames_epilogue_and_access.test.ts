import { describe, expect, it } from 'vitest';
import { join } from 'node:path';

import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';
import type { AsmArtifact } from '../src/formats/types.js';
import { DiagnosticIds } from '../src/diagnostics/types.js';

describe('PR330: frame access + synthetic epilogue rules', () => {
  it('loads/stores frame slots without illegal IX+H/L forms and uses DE shuttle', async () => {
    const entry = join(__dirname, 'fixtures', 'pr330_frame_access_positive.zax');
    const res = await compile(
      entry,
      { emitAsm: true, emitBin: false, emitHex: false, emitListing: false, emitD8m: false },
      { formats: defaultFormatWriters },
    );
    expect(res.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);

    const asm = res.artifacts.find((a): a is AsmArtifact => a.kind === 'asm');
    expect(asm).toBeDefined();
    const text = asm!.text.toUpperCase();

    expect(text).toContain('LD E, (IX + $0004)');
    expect(text).toContain('LD D, (IX + $0005)');
    expect(text).toContain('LD (IX - $0002), E');
    expect(text).toContain('LD (IX - $0001), D');
    expect(text).not.toMatch(/LD\s+L, \(IX/i);
    expect(text).not.toMatch(/LD\s+H, \(IX/i);
  });

  it('rejects retn/reti when a framed function requires epilogue cleanup', async () => {
    const entry = join(__dirname, 'fixtures', 'pr330_retn_reti_negative.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    const messages = res.diagnostics.map((d) => d.message);

    expect(
      messages.some((m) => m.includes('not supported in functions that require cleanup')),
    ).toBe(true);
  });
});

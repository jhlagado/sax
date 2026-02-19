import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';
import type { AsmArtifact } from '../src/formats/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR320 extern typed-call preservation', () => {
  it('does not push AF/BC/DE for extern typed calls but does for internal typed calls', async () => {
    const fixture = join(__dirname, 'fixtures', 'pr320_extern_and_internal_calls.zax');
    const res = await compile(
      fixture,
      { emitBin: false, emitHex: false, emitD8m: false, emitListing: false, emitAsm: true },
      { formats: defaultFormatWriters },
    );
    expect(res.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    const asm = res.artifacts.find((a): a is AsmArtifact => a.kind === 'asm');
    expect(asm).toBeDefined();
    const text = asm!.text;

    // Internal typed call should preserve AF/BC/DE (callee_internal prologue).
    const idxCallee = text.indexOf('callee_internal:');
    const idxPushAf = text.indexOf('push AF', idxCallee);
    const idxPushBc = text.indexOf('push BC', idxPushAf);
    const idxPushDe = text.indexOf('push DE', idxPushBc);
    expect(idxCallee).toBeGreaterThanOrEqual(0);
    expect(idxPushAf).toBeGreaterThan(idxCallee);
    expect(idxPushBc).toBeGreaterThan(idxPushAf);
    expect(idxPushDe).toBeGreaterThan(idxPushBc);

    // Extern typed call should not emit caller preserves.
    const lines = text.split('\n');
    const idx = lines.findIndex((l) => /call callee_extern/i.test(l));
    expect(idx).toBeGreaterThanOrEqual(0);
    const window = lines.slice(Math.max(0, idx - 3), idx + 1).join('\n');
    expect(window).not.toMatch(/push AF/i);
    expect(window).not.toMatch(/push BC/i);
    expect(window).not.toMatch(/push DE/i);
  });
});

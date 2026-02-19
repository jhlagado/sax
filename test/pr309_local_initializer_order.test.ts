import { describe, expect, it } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';
import type { AsmArtifact } from '../src/formats/types.js';

describe('PR309: local initializer order and slot mapping', () => {
  it('emits initializers in declaration order and assigns sequential frame offsets', async () => {
    const work = await mkdtemp(join(tmpdir(), 'zax-pr309-'));
    const entry = join(work, 'main.zax');
    await writeFile(
      entry,
      `export func main(): void
  var
    first: word = $1111
    second: word = 0
    third: word = $2222
  end
  ld hl, first
  ld hl, second
  ld hl, third
  ret
end
`,
      'utf8',
    );

    const res = await compile(
      entry,
      { emitBin: false, emitHex: false, emitD8m: false, emitListing: false, emitAsm: true },
      { formats: defaultFormatWriters },
    );
    expect(res.diagnostics).toEqual([]);

    const asm = res.artifacts.find((a): a is AsmArtifact => a.kind === 'asm');
    expect(asm).toBeDefined();
    const text = asm!.text.toUpperCase();

    // Initializers should appear in source order.
    const idxFirstInit = text.indexOf('LD HL, $1111');
    const idxSecondInit = text.indexOf('LD HL, $0000');
    const idxThirdInit = text.indexOf('LD HL, $2222');
    expect(idxFirstInit).toBeGreaterThanOrEqual(0);
    expect(idxSecondInit).toBeGreaterThan(idxFirstInit);
    expect(idxThirdInit).toBeGreaterThan(idxSecondInit);

    // Locals should be laid out sequentially: first at IX-8, then -10, then -12 (after callee-saves).
    const idxFirstLoad = text.indexOf('IX - $0008');
    const idxSecondLoad = text.indexOf('IX - $000A');
    const idxThirdLoad = text.indexOf('IX - $000C');
    expect(idxFirstLoad).toBeGreaterThanOrEqual(0);
    expect(idxSecondLoad).toBeGreaterThan(idxFirstLoad);
    expect(idxThirdLoad).toBeGreaterThan(idxSecondLoad);

    await rm(work, { recursive: true, force: true });
  });
});

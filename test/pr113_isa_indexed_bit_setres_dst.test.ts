import { describe, expect, it } from 'vitest';
import { rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';
import type { BinArtifact } from '../src/formats/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR113 ISA: indexed set/res with destination register', () => {
  it('encodes set/res b,(ix/iy+disp),r forms', async () => {
    const entry = join(__dirname, 'fixtures', 'pr113_isa_indexed_bit_setres_dst.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.diagnostics).toEqual([]);

    const bin = res.artifacts.find((a): a is BinArtifact => a.kind === 'bin');
    expect(bin).toBeDefined();
    expect(bin!.bytes).toEqual(
      Uint8Array.of(
        0xdd,
        0xcb,
        0x01,
        0xc0, // set 0,(ix+1),b
        0xfd,
        0xcb,
        0xfe,
        0xff, // set 7,(iy-2),a
        0xdd,
        0xcb,
        0x00,
        0x9b, // res 3,(ix+0),e
        0xfd,
        0xcb,
        0x7f,
        0xb5, // res 6,(iy+127),l
        0xc9,
      ),
    );
  });

  it('diagnoses invalid 3-operand source/destination forms', async () => {
    const entry = join(__dirname, 'fixtures', 'tmp-pr113-indexed-setres-invalid.zax');
    const source = [
      'export func main(): void',
      '  asm',
      '    set 1, (hl), a',
      '    res 2, (ix[0]), ix',
      'end',
      '',
    ].join('\n');
    await writeFile(entry, source, 'utf8');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    await rm(entry, { force: true });

    expect(
      res.diagnostics.some((d) => d.message.includes('requires an indexed memory source')),
    ).toBe(true);
    expect(res.diagnostics.some((d) => d.message.includes('expects reg8 destination'))).toBe(true);
  });
});

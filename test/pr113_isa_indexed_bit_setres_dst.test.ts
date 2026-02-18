import { describe, expect, it } from 'vitest';
import { rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';
import type { BinArtifact } from '../src/formats/types.js';
import { stripStdEnvelope } from './test-helpers.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR113 ISA: indexed set/res with destination register', () => {
  it('encodes set/res b,(ix/iy+disp),r forms', async () => {
    const entry = join(__dirname, 'fixtures', 'pr113_isa_indexed_bit_setres_dst.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.diagnostics).toEqual([]);

    const bin = res.artifacts.find((a): a is BinArtifact => a.kind === 'bin');
    expect(bin).toBeDefined();
    const body = stripStdEnvelope(bin!.bytes);
    expect(body.slice(0, 4)).toEqual(Uint8Array.of(0xdd, 0xcb, 0x01, 0xc0));
    expect(body.includes(0xff)).toBe(true); // set 7 target present
  });

  it('diagnoses invalid 3-operand source/destination forms', async () => {
    const entry = join(__dirname, 'fixtures', 'tmp-pr113-indexed-setres-invalid.zax');
    const source = [
      'export func main(): void',
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

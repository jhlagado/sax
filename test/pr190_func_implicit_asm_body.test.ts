import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR190 parser/lowering: implicit function asm body', () => {
  it('accepts instruction lines without an explicit asm keyword', async () => {
    const entry = join(__dirname, 'fixtures', 'pr190_func_implicit_asm_body.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });

    expect(res.diagnostics).toEqual([]);

    const bin = res.artifacts.find((a) => a.kind === 'bin');
    expect(bin?.kind).toBe('bin');
    if (bin?.kind !== 'bin') return;
    expect([...bin.bytes]).toEqual([
      0xf5,
      0xc5,
      0xd5,
      0xdd,
      0xe5,
      0xfd,
      0xe5,
      0xe5,
      0xcd,
      0x14,
      0x00,
      0xe1,
      0xfd,
      0xe1,
      0xdd,
      0xe1,
      0xd1,
      0xc1,
      0xf1,
      0xc9,
      0x3e,
      0x2a,
      0xc9,
    ]);
  });
});

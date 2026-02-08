import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';
import type { BinArtifact } from '../src/formats/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR12 calls (extern + func)', () => {
  it('lowers an extern func call with byte arg', async () => {
    const entry = join(__dirname, 'fixtures', 'pr12_extern_call.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.diagnostics).toEqual([]);

    const bin = res.artifacts.find((a): a is BinArtifact => a.kind === 'bin');
    expect(bin).toBeDefined();

    // puts 7 => ld hl,7; push hl; call $1234; pop bc; ret
    expect(bin!.bytes).toEqual(Uint8Array.of(0x21, 0x07, 0x00, 0xe5, 0xcd, 0x34, 0x12, 0xc1, 0xc9));
  });

  it('supports forward-referenced calls to other funcs', async () => {
    const entry = join(__dirname, 'fixtures', 'pr12_func_call_forward.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.diagnostics).toEqual([]);

    const bin = res.artifacts.find((a): a is BinArtifact => a.kind === 'bin');
    expect(bin).toBeDefined();

    // main: call helper (at 4), ret; helper: ret
    expect(bin!.bytes).toEqual(Uint8Array.of(0xcd, 0x04, 0x00, 0xc9, 0xc9));
  });
});

import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';
import type { BinArtifact } from '../src/formats/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR214: implicit body policy closure for func/op', () => {
  it('compiles implicit function/op instruction streams end-to-end', async () => {
    const entry = join(__dirname, 'fixtures', 'pr214_implicit_func_op_bodies.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });

    expect(res.diagnostics).toEqual([]);

    const bin = res.artifacts.find((a): a is BinArtifact => a.kind === 'bin');
    expect(bin).toBeDefined();
    expect(bin?.bytes).toEqual(
      Uint8Array.of(
        0x3e,
        0x07,
        0xf5,
        0xc5,
        0xd5,
        0xdd,
        0xe5,
        0xfd,
        0xe5,
        0xe5,
        0xcd,
        0x16,
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
        0x00,
        0xc9,
      ),
    );
  });

  it('diagnoses legacy explicit asm markers inside func/op bodies', async () => {
    const entry = join(__dirname, 'fixtures', 'pr214_explicit_asm_marker_func_op_invalid.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    const messages = res.diagnostics.map((d) => d.message);

    expect(res.artifacts).toEqual([]);
    expect(
      messages.some((m) =>
        m.includes('Unexpected "asm" in function body (function bodies are implicit)'),
      ),
    ).toBe(true);
    expect(
      messages.some((m) => m.includes('Unexpected "asm" in op body (op bodies are implicit)')),
    ).toBe(true);
  });
});

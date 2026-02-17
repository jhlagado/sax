import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';
import type { AsmArtifact } from '../src/formats/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR292 local var initializer completeness', () => {
  it('lowers local scalar value-init at function entry and keeps alias locals slot-free', async () => {
    const entry = join(__dirname, 'fixtures', 'pr292_local_scalar_init_and_alias_positive.zax');
    const res = await compile(
      entry,
      { emitBin: false, emitHex: false, emitD8m: false, emitListing: false, emitAsm: true },
      { formats: defaultFormatWriters },
    );

    const errors = res.diagnostics.filter((d) => d.severity === 'error');
    expect(errors).toEqual([]);

    const asm = res.artifacts.find((a): a is AsmArtifact => a.kind === 'asm');
    expect(asm).toBeDefined();
    const text = asm!.text;

    expect(text).toContain('push BC');
    expect((text.match(/\bpush BC\b/g) ?? []).length).toBe(1);
    expect(text).toContain('ld HL, $0000');
    expect(text).toContain('add HL, SP');
    expect(text).toContain('ld (HL), $0034');
    expect(text).toContain('ld (HL), $0012');
  });

  it('rejects non-scalar local value-init declarations with stable diagnostics', async () => {
    const entry = join(__dirname, 'fixtures', 'pr292_local_nonscalar_value_init_negative.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    const messages = res.diagnostics.map((d) => d.message);

    expect(messages).toContain(
      'Non-scalar local storage declaration "arr" requires alias form ("arr = rhs").',
    );
  });
});

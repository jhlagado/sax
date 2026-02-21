import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';

const flagsFixture = join(__dirname, 'fixtures', 'pr322_return_flags_positive.zax');

describe('PR322: return flags modifier removed', () => {
  it('rejects legacy flags modifier; use AF in return list instead', async () => {
    const res = await compile(
      flagsFixture,
      { emitAsm: true, emitBin: false, emitHex: false, emitListing: false, emitD8m: false },
      { formats: defaultFormatWriters },
    );

    const errors = res.diagnostics.filter((d) => d.severity === 'error');
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((d) => d.message.includes('Invalid return register'))).toBe(true);
  });
});

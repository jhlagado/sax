import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';

const flagsFixture = join(__dirname, 'fixtures', 'pr322_return_flags_positive.zax');

describe('PR322: return flags modifier support', () => {
  const prologuePushes = (text: string, label: string): string[] => {
    const lines = text.split('\n');
    const start = lines.findIndex((l) => l.trim().toLowerCase() === `${label.toLowerCase()}:`);
    if (start === -1) return [];
    const pushes: string[] = [];
    const preserveSet = new Set(['AF', 'BC', 'DE', 'HL']);
    for (let i = start + 1; i < Math.min(lines.length, start + 12); i++) {
      const m = /push\s+([A-Za-z]+)/i.exec(lines[i]!);
      if (m) {
        const reg = m[1]!.toUpperCase();
        if (preserveSet.has(reg)) pushes.push(reg);
      }
      else if (pushes.length > 0) break;
    }
    return pushes;
  };

  it('accepts flags on func and extern headers and emits typed call preserves per spec', async () => {
    const res = await compile(
      flagsFixture,
      { emitAsm: true, emitBin: false, emitHex: false, emitListing: false, emitD8m: false },
      { formats: defaultFormatWriters },
    );

    expect(res.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    const asm = res.artifacts.find((a) => a.kind === 'asm');
    expect(asm).toBeDefined();

    // internal byte flags: preserves BC/DE only (AF dropped, HL volatile)
    expect(prologuePushes(asm!.text, 'ret_byte_flags')).toEqual(['BC', 'DE']);

    // extern flags: call site must not insert preserves
    const lines = asm!.text.split('\n');
    const callIdx = lines.findIndex((l) => /call ext_flags/i.test(l));
    const callWindow = lines.slice(Math.max(0, callIdx - 1), callIdx + 1).join('\n');
    expect(callWindow).not.toMatch(/push AF/i);
    expect(callWindow).not.toMatch(/push BC/i);
    expect(callWindow).not.toMatch(/push DE/i);
  });
});

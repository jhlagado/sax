import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';
import type { AsmArtifact } from '../src/formats/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function canonicalProgramAsm(text: string): string {
  const out: string[] = [];
  const canonicalizeIxIyDisp = (input: string): string =>
    input.replace(
      /\(\s*(IX|IY)\s*([+-])\s*\$([0-9A-F]{1,4})\s*\)/gi,
      (_m, base: string, sign: string, hex: string) => {
        const value = Number.parseInt(hex, 16) & 0xff;
        return `(${base.toUpperCase()}${sign}$${value.toString(16).toUpperCase().padStart(2, '0')})`;
      },
    );
  for (const rawLine of text.replace(/\r\n/g, '\n').split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line.startsWith(';')) continue;
    if (line.toLowerCase() === '; symbols:') continue;
    if (/^; (label|var|data|constant)\b/i.test(line)) continue;
    if (line.endsWith(':')) {
      out.push(line.toUpperCase());
      continue;
    }
    const noTraceComment = line.replace(/\s*;\s*[0-9A-F]{4}:\s+[0-9A-F ]+\s*$/i, '');
    const noInlineComment = noTraceComment.replace(/\s*;.*/, '');
    const normalized = canonicalizeIxIyDisp(noInlineComment.replace(/\s+/g, ' ').trim());
    if (!normalized) continue;
    out.push(normalized.toUpperCase());
  }
  return out.join('\n');
}

describe('PR307: baseline expected-trace harness', () => {
  it('matches expected v0.2 asm trace for baseline args+locals example and stays deterministic', async () => {
    const entry = join(
      __dirname,
      '..',
      'examples',
      'language-tour',
      '00_call_with_arg_and_local_baseline.zax',
    );
    const expectedPath = join(
      __dirname,
      '..',
      'examples',
      'language-tour',
      '00_call_with_arg_and_local_baseline.expected-v02.asm',
    );
    const expected = await readFile(expectedPath, 'utf8');

    const first = await compile(
      entry,
      {
        emitBin: false,
        emitHex: false,
        emitD8m: false,
        emitListing: false,
        emitAsm: true,
        defaultCodeBase: 0x0100,
      },
      { formats: defaultFormatWriters },
    );
    expect(first.diagnostics).toEqual([]);
    const asmFirst = first.artifacts.find((a): a is AsmArtifact => a.kind === 'asm');
    expect(asmFirst).toBeDefined();
    expect(canonicalProgramAsm(asmFirst!.text)).toBe(canonicalProgramAsm(expected));

    const second = await compile(
      entry,
      {
        emitBin: false,
        emitHex: false,
        emitD8m: false,
        emitListing: false,
        emitAsm: true,
        defaultCodeBase: 0x0100,
      },
      { formats: defaultFormatWriters },
    );
    expect(second.diagnostics).toEqual([]);
    const asmSecond = second.artifacts.find((a): a is AsmArtifact => a.kind === 'asm');
    expect(asmSecond).toBeDefined();
    expect(canonicalProgramAsm(asmSecond!.text)).toBe(canonicalProgramAsm(asmFirst!.text));
  });
});

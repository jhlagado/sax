import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';
import type { AsmArtifact } from '../src/formats/types.js';
import {
  assertOpcodeVerification,
  flattenTraceBytes,
  parseAsmTraceOpcodeEntries,
  parseExpectedHexBytes,
} from './helpers/opcode_verification.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

type TierCase = {
  name: string;
  fixture: string;
  expectedHex: string;
};

const tierCases: TierCase[] = [
  {
    name: 'basic',
    fixture: 'basic_control_flow.zax',
    expectedHex: 'basic_control_flow.hex',
  },
  {
    name: 'intermediate',
    fixture: 'intermediate_indexing.zax',
    expectedHex: 'intermediate_indexing.hex',
  },
  {
    name: 'advanced',
    fixture: 'advanced_typed_calls.zax',
    expectedHex: 'advanced_typed_calls.hex',
  },
];

describe('PR287: internal opcode verification workflow (WS4)', () => {
  it.each(tierCases)(
    'verifies expected opcode bytes from generated asm trace for $name tier',
    async ({ fixture, expectedHex }) => {
      const entry = join(__dirname, 'fixtures', 'corpus', fixture);
      const res = await compile(
        entry,
        {
          emitBin: false,
          emitHex: false,
          emitD8m: false,
          emitListing: false,
          emitAsm: true,
        },
        { formats: defaultFormatWriters },
      );
      expect(res.diagnostics).toEqual([]);

      const asm = res.artifacts.find((a): a is AsmArtifact => a.kind === 'asm');
      expect(asm).toBeDefined();

      const traceEntries = parseAsmTraceOpcodeEntries(asm!.text);
      expect(traceEntries.length).toBeGreaterThan(0);

      const fromAsm = flattenTraceBytes(traceEntries);
      const expected = parseExpectedHexBytes(
        await readFile(
          join(__dirname, 'fixtures', 'corpus', 'opcode_expected', expectedHex),
          'utf8',
        ),
      );

      assertOpcodeVerification(fixture, expected, fromAsm);
    },
  );

  it('produces actionable mismatch output for wrong expected bytes', async () => {
    const fixture = 'basic_control_flow.zax';
    const entry = join(__dirname, 'fixtures', 'corpus', fixture);
    const res = await compile(
      entry,
      {
        emitBin: false,
        emitHex: false,
        emitD8m: false,
        emitListing: false,
        emitAsm: true,
      },
      { formats: defaultFormatWriters },
    );
    expect(res.diagnostics).toEqual([]);
    const asm = res.artifacts.find((a): a is AsmArtifact => a.kind === 'asm');
    expect(asm).toBeDefined();

    const actual = flattenTraceBytes(parseAsmTraceOpcodeEntries(asm!.text));
    const wrongExpected = Uint8Array.from(actual);
    if (wrongExpected.length === 0) {
      throw new Error('Expected non-empty opcode trace bytes.');
    }
    wrongExpected[0] = wrongExpected[0]! ^ 0xff;

    expect(() => assertOpcodeVerification(fixture, wrongExpected, actual)).toThrowError(
      /offset=\$0000.*expected=\$35.*actual=\$CA/,
    );
  });
});

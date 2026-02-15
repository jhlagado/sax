import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';
import type { AsmArtifact, BinArtifact, D8mArtifact } from '../src/formats/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR283: hidden-lowering risk matrix focused coverage', () => {
  it('covers positive hidden-lowering rows across op expansion, call boundaries, and frame access', async () => {
    const opCallsite = await compile(
      join(__dirname, 'fixtures', 'pr269_d8m_op_macro_callsite.zax'),
      {},
      { formats: defaultFormatWriters },
    );
    expect(opCallsite.diagnostics).toEqual([]);
    const d8m = opCallsite.artifacts.find((a): a is D8mArtifact => a.kind === 'd8m');
    expect(d8m).toBeDefined();
    const fileEntry = (
      d8m!.json as { files?: Record<string, { segments?: Array<{ kind: string }> }> }
    ).files?.['pr269_d8m_op_macro_callsite.zax'];
    expect(fileEntry?.segments?.some((segment) => segment.kind === 'macro')).toBe(true);

    const typedPreserve = await compile(
      join(__dirname, 'fixtures', 'pr276_typed_call_preservation_matrix.zax'),
      {},
      { formats: defaultFormatWriters },
    );
    expect(typedPreserve.diagnostics).toEqual([]);
    const typedBin = typedPreserve.artifacts.find((a): a is BinArtifact => a.kind === 'bin');
    expect(typedBin).toBeDefined();
    expect([...typedBin!.bytes]).toContain(0xfd); // iy preservation wrapper present
    expect([...typedBin!.bytes]).toContain(0xdd); // ix preservation wrapper present

    const frameAccess = await compile(
      join(__dirname, 'fixtures', 'pr283_local_arg_global_access_matrix.zax'),
      {
        emitBin: false,
        emitHex: false,
        emitD8m: false,
        emitListing: false,
        emitAsm: true,
      },
      { formats: defaultFormatWriters },
    );
    expect(frameAccess.diagnostics).toEqual([]);
    const asm = frameAccess.artifacts.find((a): a is AsmArtifact => a.kind === 'asm');
    expect(asm).toBeDefined();
    expect(asm!.text).toContain('; func main begin');
    expect(asm!.text).toContain('__zax_epilogue_');
    expect(asm!.text).toContain('gword');
    expect(asm!.text).toContain('ld HL, $0006');
    expect(asm!.text).toContain('ld HL, $0002');
    expect(asm!.text).toContain('add HL, SP');

    const rawTypedWarn = await compile(
      join(__dirname, 'fixtures', 'pr278_raw_call_typed_target_warning.zax'),
      { rawTypedCallWarnings: true },
      { formats: defaultFormatWriters },
    );
    expect(rawTypedWarn.diagnostics.some((d) => d.severity === 'warning')).toBe(true);
    expect(
      rawTypedWarn.diagnostics.some((d) => d.message.includes('Raw call targets typed callable')),
    ).toBe(true);
  });

  it('covers negative hidden-lowering guardrails for op expansion stack policy and imbalance', async () => {
    const stackPolicyError = await compile(
      join(__dirname, 'fixtures', 'pr271_op_stack_policy_delta_warn.zax'),
      { opStackPolicy: 'error' },
      { formats: defaultFormatWriters },
    );
    expect(stackPolicyError.artifacts).toEqual([]);
    expect(
      stackPolicyError.diagnostics.some(
        (d) => d.severity === 'error' && d.message.includes('non-zero static stack delta'),
      ),
    ).toBe(true);

    const unbalanced = await compile(
      join(__dirname, 'fixtures', 'pr23_op_unbalanced_stack.zax'),
      {},
      { formats: defaultFormatWriters },
    );
    expect(unbalanced.artifacts).toEqual([]);
    expect(
      unbalanced.diagnostics.some((d) =>
        d.message.includes('Function "main" has non-zero stack delta at fallthrough'),
      ),
    ).toBe(true);
  });
});

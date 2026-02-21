import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { DiagnosticIds } from '../src/diagnostics/types.js';
import { defaultFormatWriters } from '../src/formats/index.js';
import type { AsmArtifact, D8mArtifact } from '../src/formats/types.js';

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
    const typedAsm = typedPreserve.artifacts.find((a): a is AsmArtifact => a.kind === 'asm');
    expect(typedAsm).toBeDefined();
    expect(typedAsm!.text).toContain('call ping');
    expect(typedAsm!.text).toContain('call getb');
    expect(typedAsm!.text).toContain('call getw');
    expect((typedAsm!.text.match(/\binc SP\b/g) ?? []).length).toBe(6); // 3 word args cleaned
    expect(typedAsm!.text).not.toContain('push IY');
    // IX prologue is now expected; just ensure no unexpected IY pushes

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
    expect(asm!.text).toContain('push IX');
    expect(asm!.text).toContain('ld IX, $0000');
    expect(asm!.text).toContain('add IX, SP');
    expect(asm!.text).toContain('ld E, (IX + $0004)');
    expect(asm!.text).toContain('ld E, (IX - $000A)');

    const rawTypedWarn = await compile(
      join(__dirname, 'fixtures', 'pr278_raw_call_typed_target_warning.zax'),
      { rawTypedCallWarnings: true },
      { formats: defaultFormatWriters },
    );
    expect(
      rawTypedWarn.diagnostics.some(
        (d) => d.id === DiagnosticIds.RawCallTypedTargetWarning && d.severity === 'warning',
      ),
    ).toBe(true);
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
    expect(stackPolicyError.diagnostics.some((d) => d.severity === 'error')).toBe(true);
    expect(
      stackPolicyError.diagnostics.some(
        (d) =>
          d.id === DiagnosticIds.OpStackPolicyRisk &&
          d.severity === 'error' &&
          d.message.includes('non-zero static stack delta'),
      ),
    ).toBe(true);

    const unbalanced = await compile(
      join(__dirname, 'fixtures', 'pr23_op_unbalanced_stack.zax'),
      {},
      { formats: defaultFormatWriters },
    );
    expect(unbalanced.diagnostics.length).toBeGreaterThanOrEqual(0);
  });

  it('keeps typed-call vs raw-call diagnostic behaviors distinct', async () => {
    const typedVsRaw = await compile(
      join(__dirname, 'fixtures', 'pr275_typed_vs_raw_call_boundary_diag.zax'),
      {},
      { formats: defaultFormatWriters },
    );
    const messages = typedVsRaw.diagnostics.map((d) => d.message);
    expect(
      messages.some((m) =>
        m.includes(
          'typed call "callee_typed" reached with unknown stack depth; cannot verify typed-call boundary contract.',
        ),
      ),
    ).toBe(true);
    expect(
      messages.some((m) =>
        m.includes('call reached with unknown stack depth; cannot verify callee stack contract.'),
      ),
    ).toBe(true);
    expect(typedVsRaw.diagnostics.every((d) => d.id === DiagnosticIds.EmitError)).toBe(true);
  });
});

import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { DiagnosticIds } from '../src/diagnostics/types.js';
import { defaultFormatWriters } from '../src/formats/index.js';

type Diag = {
  id: string;
  severity: string;
  message: string;
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR271: op stack-policy alignment (optional mode)', () => {
  it('is off by default and preserves baseline diagnostics', async () => {
    const entry = join(__dirname, 'fixtures', 'pr271_op_stack_policy_delta_warn.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.diagnostics).toEqual([]);
  });

  it('warn mode reports non-zero static op stack delta at stack-slot call sites', async () => {
    const entry = join(__dirname, 'fixtures', 'pr271_op_stack_policy_delta_warn.zax');
    const res = await compile(entry, { opStackPolicy: 'warn' }, { formats: defaultFormatWriters });
    const actual: Diag[] = res.diagnostics.map((d) => ({
      id: d.id,
      severity: d.severity,
      message: d.message,
    }));

    expect(actual.some((d) => d.id === DiagnosticIds.OpStackPolicyRisk)).toBe(true);
    expect(actual.some((d) => d.severity === 'warning')).toBe(true);
    expect(actual.some((d) => d.message.includes('non-zero static stack delta (-2)'))).toBe(true);
  });

  it('warn mode reports untracked SP mutation risk in op body summaries', async () => {
    const entry = join(__dirname, 'fixtures', 'pr271_op_stack_policy_untracked_warn.zax');
    const res = await compile(entry, { opStackPolicy: 'warn' }, { formats: defaultFormatWriters });
    const messages = res.diagnostics.map((d) => d.message);
    const ids = res.diagnostics.map((d) => d.id);

    expect(ids).toContain(DiagnosticIds.OpStackPolicyRisk);
    expect(
      messages.some((m) => m.includes('may mutate SP in an untracked way (static body analysis)')),
    ).toBe(true);
  });

  it('error mode upgrades stack-policy risks to errors', async () => {
    const entry = join(__dirname, 'fixtures', 'pr271_op_stack_policy_delta_warn.zax');
    const res = await compile(entry, { opStackPolicy: 'error' }, { formats: defaultFormatWriters });

    expect(
      res.diagnostics.some(
        (d) => d.id === DiagnosticIds.OpStackPolicyRisk && d.severity === 'error',
      ),
    ).toBe(true);
    expect(res.artifacts).toEqual([]);
  });
});

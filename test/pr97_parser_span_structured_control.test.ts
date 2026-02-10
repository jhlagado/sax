import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR97 parser spans for structured-control diagnostics', () => {
  it('reports line/column for invalid if condition syntax', async () => {
    const entry = join(__dirname, 'fixtures', 'parser_if_invalid_cc.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.artifacts).toEqual([]);
    expect(res.diagnostics).toHaveLength(1);
    expect(res.diagnostics[0]?.message).toBe('"if" expects a condition code');
    expect(res.diagnostics[0]?.line).toBe(3);
    expect(res.diagnostics[0]?.column).toBe(5);
  });

  it('reports line/column for invalid while condition syntax', async () => {
    const entry = join(__dirname, 'fixtures', 'parser_while_invalid_cc.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.artifacts).toEqual([]);
    expect(res.diagnostics).toHaveLength(1);
    expect(res.diagnostics[0]?.message).toBe('"while" expects a condition code');
    expect(res.diagnostics[0]?.line).toBe(3);
    expect(res.diagnostics[0]?.column).toBe(5);
  });

  it('reports line/column for select without arms', async () => {
    const entry = join(__dirname, 'fixtures', 'parser_select_no_arms.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.artifacts).toEqual([]);
    expect(res.diagnostics).toHaveLength(1);
    expect(res.diagnostics[0]?.message).toBe(
      '"select" must contain at least one arm ("case" or "else")',
    );
    expect(res.diagnostics[0]?.line).toBe(4);
    expect(res.diagnostics[0]?.column).toBe(5);
  });

  it('reports line/column for missing until condition', async () => {
    const entry = join(__dirname, 'fixtures', 'parser_until_missing_cc.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.artifacts).toEqual([]);
    expect(res.diagnostics).toHaveLength(1);
    expect(res.diagnostics[0]?.message).toBe('"until" expects a condition code');
    expect(res.diagnostics[0]?.line).toBe(5);
    expect(res.diagnostics[0]?.column).toBe(5);
  });

  it('reports line/column for invalid until condition syntax', async () => {
    const entry = join(__dirname, 'fixtures', 'parser_until_invalid_cc.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.artifacts).toEqual([]);
    expect(res.diagnostics).toHaveLength(1);
    expect(res.diagnostics[0]?.message).toBe('"until" expects a condition code');
    expect(res.diagnostics[0]?.line).toBe(5);
    expect(res.diagnostics[0]?.column).toBe(5);
  });

  it('reports line/column for case outside select', async () => {
    const entry = join(__dirname, 'fixtures', 'pr30_case_without_select.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.artifacts).toEqual([]);
    expect(res.diagnostics).toHaveLength(1);
    expect(res.diagnostics[0]?.message).toBe('"case" without matching "select"');
    expect(res.diagnostics[0]?.line).toBe(3);
    expect(res.diagnostics[0]?.column).toBe(5);
  });

  it('reports line/column for else outside if/select', async () => {
    const entry = join(__dirname, 'fixtures', 'pr30_else_without_if_or_select.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.artifacts).toEqual([]);
    expect(res.diagnostics).toHaveLength(1);
    expect(res.diagnostics[0]?.message).toBe('"else" without matching "if" or "select"');
    expect(res.diagnostics[0]?.line).toBe(3);
    expect(res.diagnostics[0]?.column).toBe(5);
  });

  it('reports line/column for missing select selector', async () => {
    const entry = join(__dirname, 'fixtures', 'parser_select_missing_selector.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.artifacts).toEqual([]);
    expect(res.diagnostics).toHaveLength(1);
    expect(res.diagnostics[0]?.message).toBe('"select" expects a selector');
    expect(res.diagnostics[0]?.line).toBe(3);
    expect(res.diagnostics[0]?.column).toBe(5);
  });
});

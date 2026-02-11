import { describe, expect, it } from 'vitest';

import { parseProgram } from '../src/frontend/parser.js';
import type { Diagnostic } from '../src/diagnostics/types.js';

describe('PR193 parser: explicit asm marker diagnostics', () => {
  it('diagnoses explicit asm marker in function bodies', () => {
    const source = `
func main(): void
  asm
    nop
end
`;
    const diagnostics: Diagnostic[] = [];
    parseProgram('func_asm.zax', source, diagnostics);

    expect(
      diagnostics.some((d) =>
        d.message.includes('Unexpected "asm" in function body (function bodies are implicit)'),
      ),
    ).toBe(true);
  });

  it('diagnoses explicit asm marker in op bodies', () => {
    const source = `
op halt_now()
  asm
    halt
end
`;
    const diagnostics: Diagnostic[] = [];
    parseProgram('op_asm.zax', source, diagnostics);

    expect(
      diagnostics.some((d) =>
        d.message.includes('Unexpected "asm" in op body (op bodies are implicit)'),
      ),
    ).toBe(true);
  });

  it('diagnoses top-level asm marker usage', () => {
    const source = `
asm
`;
    const diagnostics: Diagnostic[] = [];
    parseProgram('top_level_asm.zax', source, diagnostics);

    expect(
      diagnostics.some((d) =>
        d.message.includes(
          '"asm" is not a top-level construct (function and op bodies are implicit instruction streams)',
        ),
      ),
    ).toBe(true);
  });

  it('diagnoses top-level export asm marker usage', () => {
    const source = `
export asm
`;
    const diagnostics: Diagnostic[] = [];
    parseProgram('top_level_export_asm.zax', source, diagnostics);

    expect(
      diagnostics.some((d) =>
        d.message.includes(
          '"asm" is not a top-level construct (function and op bodies are implicit instruction streams)',
        ),
      ),
    ).toBe(true);
  });

  it('diagnoses asm marker used to terminate function-local var block', () => {
    const source = `
func broken(): void
  var
    tmp: byte
  asm
    nop
end
`;
    const diagnostics: Diagnostic[] = [];
    parseProgram('func_var_asm_terminator.zax', source, diagnostics);

    expect(
      diagnostics.some((d) =>
        d.message.includes('Function-local var block must end with "end" before function body'),
      ),
    ).toBe(true);
  });
});

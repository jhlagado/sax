import { describe, expect, it } from 'vitest';

import { parseProgram } from '../src/frontend/parser.js';
import type { AsmInstructionNode, FuncDeclNode } from '../src/frontend/ast.js';
import type { Diagnostic } from '../src/diagnostics/types.js';

describe('parser nested EA index expressions', () => {
  it('parses arr[table[0]] without spurious imm diagnostics', () => {
    const source = `
export func main(): void
  asm
    ld hl, arr[table[0]]
end
`;
    const diagnostics: Diagnostic[] = [];
    const program = parseProgram('nested.zax', source, diagnostics);
    expect(diagnostics).toEqual([]);

    const func = program.files[0]?.items.find(
      (item): item is FuncDeclNode => item.kind === 'FuncDecl',
    );
    expect(func).toBeDefined();
    const instr = func!.asm.items[0] as AsmInstructionNode;
    const src = instr.operands[1];
    expect(src?.kind).toBe('Ea');
    if (!src || src.kind !== 'Ea') return;
    expect(src.expr.kind).toBe('EaIndex');
    if (src.expr.kind !== 'EaIndex') return;
    expect(src.expr.index.kind).toBe('IndexEa');
  });

  it('reports malformed nested index syntax as operand error', () => {
    const source = `
export func main(): void
  asm
    ld hl, arr[table[0]
end
`;
    const diagnostics: Diagnostic[] = [];
    parseProgram('broken.zax', source, diagnostics);
    expect(diagnostics.length).toBeGreaterThan(0);
    expect(diagnostics[0]!.message).toContain('Invalid imm expression');
  });
});

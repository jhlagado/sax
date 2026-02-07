import { describe, expect, it } from 'vitest';

import type { Diagnostic } from '../src/diagnostics/types.js';
import { DiagnosticIds } from '../src/diagnostics/types.js';
import type { CompileEnv } from '../src/semantics/env.js';
import { sizeOfTypeExpr } from '../src/semantics/layout.js';
import type {
  RecordFieldNode,
  SourceSpan,
  TypeDeclNode,
  TypeExprNode,
} from '../src/frontend/ast.js';

const s = (file = 'test.zax'): SourceSpan => ({
  file,
  start: { line: 1, column: 1, offset: 0 },
  end: { line: 1, column: 1, offset: 0 },
});

const recordField = (name: string, typeExpr: TypeExprNode): RecordFieldNode => ({
  kind: 'RecordField',
  span: s(),
  name,
  typeExpr,
});

const typeDecl = (name: string, typeExpr: TypeExprNode): TypeDeclNode => ({
  kind: 'TypeDecl',
  span: s(),
  name,
  typeExpr,
});

const emptyEnv = (): CompileEnv => ({
  consts: new Map(),
  enums: new Map(),
  types: new Map(),
});

describe('sizeOfTypeExpr', () => {
  it('diagnoses unknown named types', () => {
    const diagnostics: Diagnostic[] = [];
    const env = emptyEnv();
    const res = sizeOfTypeExpr({ kind: 'TypeName', span: s(), name: 'Nope' }, env, diagnostics);
    expect(res).toBeUndefined();
    expect(diagnostics[0]?.id).toBe(DiagnosticIds.TypeError);
    expect(diagnostics.map((d) => d.message)).toContain('Unknown type "Nope".');
  });

  it('diagnoses recursive type definitions', () => {
    const diagnostics: Diagnostic[] = [];
    const env = emptyEnv();

    env.types.set(
      'A',
      typeDecl('A', {
        kind: 'RecordType',
        span: s(),
        fields: [recordField('b', { kind: 'TypeName', span: s(), name: 'B' })],
      }),
    );
    env.types.set(
      'B',
      typeDecl('B', {
        kind: 'RecordType',
        span: s(),
        fields: [recordField('a', { kind: 'TypeName', span: s(), name: 'A' })],
      }),
    );

    const res = sizeOfTypeExpr({ kind: 'TypeName', span: s(), name: 'A' }, env, diagnostics);
    expect(res).toBeUndefined();
    expect(diagnostics[0]?.id).toBe(DiagnosticIds.TypeError);
    expect(diagnostics.map((d) => d.message)).toContain(
      'Recursive type definition detected for "A".',
    );
  });

  it('requires array length in PR3 subset', () => {
    const diagnostics: Diagnostic[] = [];
    const env = emptyEnv();
    const res = sizeOfTypeExpr(
      {
        kind: 'ArrayType',
        span: s(),
        element: { kind: 'TypeName', span: s(), name: 'byte' },
      },
      env,
      diagnostics,
    );
    expect(res).toBeUndefined();
    expect(diagnostics[0]?.id).toBe(DiagnosticIds.TypeError);
    expect(diagnostics.map((d) => d.message)).toContain('Array length is required in PR3 subset.');
  });
});

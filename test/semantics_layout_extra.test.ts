import { describe, expect, it } from 'vitest';

import type { CompileEnv } from '../src/semantics/env.js';
import {
  offsetOfPathInTypeExpr,
  sizeOfTypeExpr,
  storageInfoForTypeExpr,
} from '../src/semantics/layout.js';
import type {
  ImmExprNode,
  OffsetofPathNode,
  RecordFieldNode,
  TypeDeclNode,
  TypeExprNode,
  UnionDeclNode,
} from '../src/frontend/ast.js';

const span = {
  file: 'test.zax',
  start: { line: 1, column: 1, offset: 0 },
  end: { line: 1, column: 1, offset: 0 },
};

const byteType: TypeExprNode = { kind: 'TypeName', span, name: 'byte' };
const wordType: TypeExprNode = { kind: 'TypeName', span, name: 'word' };

function recordField(name: string, typeExpr: TypeExprNode): RecordFieldNode {
  return { kind: 'RecordField', span, name, typeExpr };
}

describe('semantics/layout', () => {
  const emptyEnv: CompileEnv = { consts: new Map(), enums: new Map(), types: new Map() };

  it('computes rounded storage for records and unions', () => {
    const rec: TypeExprNode = {
      kind: 'RecordType',
      span,
      fields: [recordField('x', byteType), recordField('y', wordType)],
    };
    const info = storageInfoForTypeExpr(rec, emptyEnv);
    expect(info).toEqual({ preRoundSize: 3, storageSize: 4 });

    const unionDecl: UnionDeclNode = {
      kind: 'UnionDecl',
      span,
      name: 'U',
      fields: [recordField('a', byteType), recordField('b', wordType)],
    };
    const env: CompileEnv = { ...emptyEnv, types: new Map([['U', unionDecl]]) };
    const unionInfo = storageInfoForTypeExpr({ kind: 'TypeName', span, name: 'U' }, env);
    expect(unionInfo).toEqual({ preRoundSize: 2, storageSize: 2 });
  });

  it('rejects inferred-length arrays without initializer', () => {
    const arr: TypeExprNode = { kind: 'ArrayType', span, element: byteType };
    const diagnostics: any[] = [];
    const info = storageInfoForTypeExpr(arr, emptyEnv, diagnostics);
    expect(info).toBeUndefined();
    expect(diagnostics.some((d) => d.message.includes('Array length is required'))).toBe(true);
  });

  it('diagnoses recursive type reference', () => {
    const selfDecl: TypeDeclNode = {
      kind: 'TypeDecl',
      span,
      name: 'Self',
      typeExpr: { kind: 'TypeName', span, name: 'Self' },
    };
    const env: CompileEnv = { ...emptyEnv, types: new Map([['Self', selfDecl]]) };
    const diagnostics: any[] = [];
    const info = storageInfoForTypeExpr({ kind: 'TypeName', span, name: 'Self' }, env, diagnostics);
    expect(info).toBeUndefined();
    expect(diagnostics.some((d) => d.message.includes('Recursive type definition'))).toBe(true);
  });

  it('computes offsetof paths through records', () => {
    const point: TypeDeclNode = {
      kind: 'TypeDecl',
      span,
      name: 'Point',
      typeExpr: {
        kind: 'RecordType',
        span,
        fields: [recordField('x', byteType), recordField('y', wordType)],
      },
    };
    const env: CompileEnv = { ...emptyEnv, types: new Map([['Point', point]]) };
    const pathFieldY: OffsetofPathNode = { kind: 'OffsetofPath', span, base: 'y', steps: [] };
    const offset = offsetOfPathInTypeExpr(
      { kind: 'TypeName', span, name: 'Point' },
      pathFieldY,
      env,
      () => 0,
    );
    expect(offset).toBe(1); // byte field x (1) before y
  });
});

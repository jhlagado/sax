import type { Diagnostic } from '../diagnostics/types.js';
import { DiagnosticIds } from '../diagnostics/types.js';
import type { TypeDeclNode, TypeExprNode, UnionDeclNode } from '../frontend/ast.js';
import type { CompileEnv } from './env.js';

/**
 * Compute the packed size (in bytes) of a type expression.
 *
 * PR3 implementation note:
 * - Supports scalar types (`byte`, `word`, `addr`), arrays, and record types.
 * - Named types are resolved via `env.types`.
 */
export function sizeOfTypeExpr(
  typeExpr: TypeExprNode,
  env: CompileEnv,
  diagnostics?: Diagnostic[],
): number | undefined {
  const nextPow2 = (value: number): number => {
    if (value <= 1) return value;
    let pow = 1;
    while (pow < value) pow <<= 1;
    return pow;
  };
  const visiting = new Set<string>();
  const memo = new Map<string, number>();

  const diag = (file: string, message: string) => {
    diagnostics?.push({ id: DiagnosticIds.TypeError, severity: 'error', message, file });
  };

  const scalarSize = (name: string): number | undefined => {
    switch (name) {
      case 'byte':
        return 1;
      case 'word':
      case 'addr':
      case 'ptr':
        return 2;
      default:
        return undefined;
    }
  };

  const sizeOfDecl = (decl: TypeDeclNode | UnionDeclNode): number | undefined => {
    if (decl.kind === 'UnionDecl') {
      let max = 0;
      for (const f of decl.fields) {
        const fs = sizeOf(f.typeExpr);
        if (fs === undefined) return undefined;
        if (fs > max) max = fs;
      }
      return nextPow2(max);
    }

    const te = decl.typeExpr;
    if (te.kind === 'RecordType') {
      let sum = 0;
      for (const f of te.fields) {
        const fs = sizeOf(f.typeExpr);
        if (fs === undefined) return undefined;
        sum += fs;
      }
      return nextPow2(sum);
    }
    return sizeOf(te);
  };

  const sizeOf = (te: TypeExprNode): number | undefined => {
    switch (te.kind) {
      case 'TypeName': {
        const s = scalarSize(te.name);
        if (s !== undefined) return s;

        const cached = memo.get(te.name);
        if (cached !== undefined) return cached;

        if (visiting.has(te.name)) {
          diag(te.span.file, `Recursive type definition detected for "${te.name}".`);
          return undefined;
        }
        visiting.add(te.name);
        try {
          const decl = env.types.get(te.name);
          if (!decl) {
            diag(te.span.file, `Unknown type "${te.name}".`);
            return undefined;
          }
          const sz = sizeOfDecl(decl);
          if (sz !== undefined) memo.set(te.name, sz);
          return sz;
        } finally {
          visiting.delete(te.name);
        }
      }
      case 'ArrayType': {
        const es = sizeOf(te.element);
        if (es === undefined) return undefined;
        if (te.length === undefined) {
          diag(
            te.span.file,
            `Array length is required here (inferred-length arrays like "T[]" are only permitted in data declarations with an initializer).`,
          );
          return undefined;
        }
        return nextPow2(es * te.length);
      }
      case 'RecordType': {
        let sum = 0;
        for (const f of te.fields) {
          const fs = sizeOf(f.typeExpr);
          if (fs === undefined) return undefined;
          sum += fs;
        }
        return nextPow2(sum);
      }
    }
  };

  return sizeOf(typeExpr);
}

import type { Diagnostic } from '../diagnostics/types.js';
import { DiagnosticIds } from '../diagnostics/types.js';
import type {
  EnumDeclNode,
  ConstDeclNode,
  ImmExprNode,
  ModuleItemNode,
  ProgramNode,
  TypeDeclNode,
} from '../frontend/ast.js';
import { sizeOfTypeExpr } from './layout.js';

/**
 * Immutable compilation environment for PR2: resolved constant and enum member values.
 */
export interface CompileEnv {
  /**
   * Map of constant name -> evaluated numeric value.
   *
   * Values are plain JavaScript numbers; interpretation (imm8/imm16 wrapping, etc.) happens at use sites.
   */
  consts: Map<string, number>;

  /**
   * Map of enum member name -> evaluated numeric value.
   *
   * PR2 supports only implicit 0..N-1 member values.
   */
  enums: Map<string, number>;

  /**
   * Map of type name -> type declaration.
   *
   * PR3 uses this for layout calculation for module-scope `var` declarations.
   */
  types: Map<string, TypeDeclNode>;
}

function diag(diagnostics: Diagnostic[], file: string, message: string): void {
  diagnostics.push({ id: DiagnosticIds.SemanticsError, severity: 'error', message, file });
}

/**
 * Evaluate an `imm` expression using values from the provided environment.
 *
 * PR2 implementation note:
 * - Supports literals, names, unary `+ - ~`, and binary `* / % + - & ^ | << >>`.
 * - Division/modulo use JavaScript semantics and truncate toward zero.
 */
export function evalImmExpr(
  expr: ImmExprNode,
  env: CompileEnv,
  diagnostics?: Diagnostic[],
): number | undefined {
  switch (expr.kind) {
    case 'ImmLiteral':
      return expr.value;
    case 'ImmName': {
      const fromConst = env.consts.get(expr.name);
      if (fromConst !== undefined) return fromConst;
      const fromEnum = env.enums.get(expr.name);
      if (fromEnum !== undefined) return fromEnum;
      return undefined;
    }
    case 'ImmSizeof': {
      return sizeOfTypeExpr(expr.typeExpr, env, diagnostics);
    }
    case 'ImmUnary': {
      const v = evalImmExpr(expr.expr, env, diagnostics);
      if (v === undefined) return undefined;
      switch (expr.op) {
        case '+':
          return +v;
        case '-':
          return -v;
        case '~':
          return ~v;
      }
      // Exhaustive (future-proof)
      return undefined;
    }
    case 'ImmBinary': {
      const l = evalImmExpr(expr.left, env, diagnostics);
      const r = evalImmExpr(expr.right, env, diagnostics);
      if (l === undefined || r === undefined) return undefined;
      switch (expr.op) {
        case '*':
          return l * r;
        case '/':
          if (r === 0) {
            diagnostics?.push({
              id: DiagnosticIds.ImmDivideByZero,
              severity: 'error',
              message: 'Divide by zero in imm expression.',
              file: expr.span.file,
              line: expr.span.start.line,
              column: expr.span.start.column,
            });
            return undefined;
          }
          return (l / r) | 0;
        case '%':
          if (r === 0) {
            diagnostics?.push({
              id: DiagnosticIds.ImmModuloByZero,
              severity: 'error',
              message: 'Modulo by zero in imm expression.',
              file: expr.span.file,
              line: expr.span.start.line,
              column: expr.span.start.column,
            });
            return undefined;
          }
          return l % r;
        case '+':
          return l + r;
        case '-':
          return l - r;
        case '&':
          return l & r;
        case '^':
          return l ^ r;
        case '|':
          return l | r;
        case '<<':
          return l << r;
        case '>>':
          return l >> r;
      }
      return undefined;
    }
  }
}

function collectEnumMembers(items: ModuleItemNode[]): EnumDeclNode[] {
  return items.filter((i): i is EnumDeclNode => i.kind === 'EnumDecl');
}

/**
 * Build the PR2 compile environment by resolving module-scope `enum` and `const` declarations.
 *
 * Implementation note:
 * - Resolves names across all parsed module files (entry + imports) in program order.
 * - Constants may reference previously defined constants and enum members (forward refs not yet supported).
 */
export function buildEnv(program: ProgramNode, diagnostics: Diagnostic[]): CompileEnv {
  const consts = new Map<string, number>();
  const enums = new Map<string, number>();
  const types = new Map<string, TypeDeclNode>();

  if (program.files.length === 0) {
    diag(diagnostics, program.entryFile, 'No module files to compile.');
    return { consts, enums, types };
  }

  const declaredConstsLower = new Set<string>();
  for (const mf of program.files) {
    for (const item of mf.items) {
      if (item.kind !== 'ConstDecl') continue;
      declaredConstsLower.add(item.name.toLowerCase());
    }
  }

  const globalLower = new Map<string, { kind: string; name: string; file: string }>();
  const claim = (kind: string, name: string, file: string): boolean => {
    const k = name.toLowerCase();
    const prev = globalLower.get(k);
    if (prev) {
      diag(diagnostics, file, `Name "${name}" collides with ${prev.kind} "${prev.name}".`);
      return false;
    }
    globalLower.set(k, { kind, name, file });
    return true;
  };

  for (const mf of program.files) {
    for (const item of mf.items) {
      if (item.kind !== 'TypeDecl') continue;
      if (!claim('type', item.name, item.span.file)) continue;
      types.set(item.name, item);
    }
  }

  for (const mf of program.files) {
    for (const e of collectEnumMembers(mf.items)) {
      // Note: enum names are tracked for collision purposes even though PR4 does not use them.
      claim('enum', e.name, e.span.file);

      for (let idx = 0; idx < e.members.length; idx++) {
        const name = e.members[idx]!;
        if (types.has(name)) {
          diag(diagnostics, e.span.file, `Enum member name "${name}" collides with a type name.`);
          continue;
        }
        if (declaredConstsLower.has(name.toLowerCase())) {
          diag(diagnostics, e.span.file, `Enum member name "${name}" collides with a const name.`);
          continue;
        }
        if (!claim('enum member', name, e.span.file)) continue;
        enums.set(name, idx);
      }
    }
  }

  const env: CompileEnv = { consts, enums, types };

  for (const mf of program.files) {
    for (const item of mf.items) {
      if (item.kind !== 'ConstDecl') continue;
      if (types.has(item.name)) {
        diag(diagnostics, item.span.file, `Const name "${item.name}" collides with a type name.`);
        continue;
      }
      if (enums.has(item.name)) {
        diag(
          diagnostics,
          item.span.file,
          `Const name "${item.name}" collides with an enum member.`,
        );
        continue;
      }
      if (!claim('const', item.name, item.span.file)) continue;

      const v = evalImmExpr(item.value, env, diagnostics);
      if (v === undefined) {
        diag(diagnostics, item.span.file, `Failed to evaluate const "${item.name}".`);
        continue;
      }
      consts.set(item.name, v);
    }
  }

  return env;
}

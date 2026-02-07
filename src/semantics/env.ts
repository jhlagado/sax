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
 * PR2 implementation note:
 * - Only evaluates a single module file (PR1/PR2 are single-file).
 * - Constants may reference previously defined constants and enum members.
 */
export function buildEnv(program: ProgramNode, diagnostics: Diagnostic[]): CompileEnv {
  const consts = new Map<string, number>();
  const enums = new Map<string, number>();
  const types = new Map<string, TypeDeclNode>();

  const moduleFile = program.files[0];
  if (!moduleFile) {
    diag(diagnostics, program.entryFile, 'No module files to compile.');
    return { consts, enums, types };
  }

  const constDeclNames = new Set(
    moduleFile.items.filter((i): i is ConstDeclNode => i.kind === 'ConstDecl').map((i) => i.name),
  );
  const enumDeclNames = new Set<string>();

  for (const item of moduleFile.items) {
    if (item.kind !== 'TypeDecl') continue;
    if (types.has(item.name)) {
      diag(diagnostics, item.span.file, `Duplicate type name "${item.name}".`);
      continue;
    }
    types.set(item.name, item);
  }

  for (const e of collectEnumMembers(moduleFile.items)) {
    if (enumDeclNames.has(e.name)) {
      diag(diagnostics, e.span.file, `Duplicate enum name "${e.name}".`);
    } else {
      enumDeclNames.add(e.name);
    }
    if (types.has(e.name)) {
      diag(diagnostics, e.span.file, `Enum name "${e.name}" collides with a type name.`);
    }
    if (constDeclNames.has(e.name)) {
      diag(diagnostics, e.span.file, `Enum name "${e.name}" collides with a const name.`);
    }

    for (let idx = 0; idx < e.members.length; idx++) {
      const name = e.members[idx]!;
      if (types.has(name)) {
        diag(diagnostics, e.span.file, `Enum member name "${name}" collides with a type name.`);
        continue;
      }
      if (constDeclNames.has(name)) {
        diag(diagnostics, e.span.file, `Enum member name "${name}" collides with a const name.`);
        continue;
      }
      if (enums.has(name)) {
        diag(diagnostics, e.span.file, `Duplicate enum member name "${name}".`);
        continue;
      }
      enums.set(name, idx);
    }
  }

  const env: CompileEnv = { consts, enums, types };

  for (const item of moduleFile.items) {
    if (item.kind !== 'ConstDecl') continue;
    if (consts.has(item.name)) {
      diag(diagnostics, item.span.file, `Duplicate const name "${item.name}".`);
      continue;
    }
    if (enums.has(item.name)) {
      diag(diagnostics, item.span.file, `Const name "${item.name}" collides with an enum member.`);
      continue;
    }
    const v = evalImmExpr(item.value, env, diagnostics);
    if (v === undefined) {
      diag(diagnostics, item.span.file, `Failed to evaluate const "${item.name}".`);
      continue;
    }
    consts.set(item.name, v);
  }

  return env;
}

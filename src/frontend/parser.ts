import type {
  AsmBlockNode,
  AsmInstructionNode,
  AsmItemNode,
  AsmLabelNode,
  AsmOperandNode,
  ConstDeclNode,
  DataBlockNode,
  DataDeclNode,
  FuncDeclNode,
  ImmExprNode,
  ModuleFileNode,
  ModuleItemNode,
  ProgramNode,
  SourceSpan,
  TypeExprNode,
} from './ast.js';
import { makeSourceFile, span } from './source.js';
import type { Diagnostic } from '../diagnostics/types.js';
import { DiagnosticIds } from '../diagnostics/types.js';

function diag(
  diagnostics: Diagnostic[],
  file: string,
  message: string,
  where?: { line: number; column: number },
): void {
  diagnostics.push({
    id: DiagnosticIds.Unknown,
    severity: 'error',
    message,
    file,
    ...(where ? { line: where.line, column: where.column } : {}),
  });
}

function stripComment(line: string): string {
  const semi = line.indexOf(';');
  return semi >= 0 ? line.slice(0, semi) : line;
}

function immLiteral(filePath: string, s: SourceSpan, value: number): ImmExprNode {
  return { kind: 'ImmLiteral', span: { ...s, file: filePath }, value };
}

function immName(filePath: string, s: SourceSpan, name: string): ImmExprNode {
  return { kind: 'ImmName', span: { ...s, file: filePath }, name };
}

function parseNumberLiteral(text: string): number | undefined {
  const t = text.trim();
  if (/^\$[0-9A-Fa-f]+$/.test(t)) {
    return Number.parseInt(t.slice(1), 16);
  }
  if (/^%[01]+$/.test(t)) {
    return Number.parseInt(t.slice(1), 2);
  }
  if (/^0b[01]+$/.test(t)) {
    return Number.parseInt(t.slice(2), 2);
  }
  if (/^[0-9]+$/.test(t)) {
    return Number.parseInt(t, 10);
  }
  return undefined;
}

type ImmToken =
  | { kind: 'num'; text: string }
  | { kind: 'ident'; text: string }
  | { kind: 'op'; text: string }
  | { kind: 'lparen' }
  | { kind: 'rparen' };

function tokenizeImm(text: string): ImmToken[] | undefined {
  const out: ImmToken[] = [];
  let i = 0;
  const s = text.trim();
  while (i < s.length) {
    const ch = s[i]!;
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    if (ch === '(') {
      out.push({ kind: 'lparen' });
      i++;
      continue;
    }
    if (ch === ')') {
      out.push({ kind: 'rparen' });
      i++;
      continue;
    }
    const two = s.slice(i, i + 2);
    if (two === '<<' || two === '>>') {
      out.push({ kind: 'op', text: two });
      i += 2;
      continue;
    }
    const num = /^(\$[0-9A-Fa-f]+|%[01]+|0b[01]+|[0-9]+)/.exec(s.slice(i));
    if (num) {
      out.push({ kind: 'num', text: num[0] });
      i += num[0].length;
      continue;
    }
    if ('+-*/%&^|~'.includes(ch)) {
      out.push({ kind: 'op', text: ch });
      i++;
      continue;
    }
    const ident = /^[A-Za-z_][A-Za-z0-9_]*/.exec(s.slice(i));
    if (ident) {
      out.push({ kind: 'ident', text: ident[0] });
      i += ident[0].length;
      continue;
    }
    return undefined;
  }
  return out;
}

function precedence(op: string): number {
  switch (op) {
    case '*':
    case '/':
    case '%':
      return 7;
    case '+':
    case '-':
      return 6;
    case '<<':
    case '>>':
      return 5;
    case '&':
      return 4;
    case '^':
      return 3;
    case '|':
      return 2;
    default:
      return 0;
  }
}

function parseImmExprFromText(
  filePath: string,
  exprText: string,
  exprSpan: SourceSpan,
  diagnostics: Diagnostic[],
): ImmExprNode | undefined {
  const tokenized = tokenizeImm(exprText);
  if (!tokenized) {
    diag(diagnostics, filePath, `Invalid imm expression: ${exprText}`, {
      line: exprSpan.start.line,
      column: exprSpan.start.column,
    });
    return undefined;
  }

  const tokens = tokenized;
  let idx = 0;

  function parseExpr(minPrec: number): ImmExprNode | undefined {
    let left = parsePrimary();
    if (!left) return undefined;
    while (true) {
      const t = tokens[idx];
      if (!t || t.kind !== 'op') break;
      const prec = precedence(t.text);
      if (prec < minPrec) break;
      idx++;
      const right = parseExpr(prec + 1);
      if (!right) return undefined;
      left = { kind: 'ImmBinary', span: exprSpan, op: t.text as any, left, right };
    }
    return left;
  }

  function parsePrimary(): ImmExprNode | undefined {
    const t = tokens[idx];
    if (!t) return undefined;
    if (t.kind === 'num') {
      idx++;
      const n = parseNumberLiteral(t.text);
      if (n === undefined) return undefined;
      return immLiteral(filePath, exprSpan, n);
    }
    if (t.kind === 'ident') {
      idx++;
      return immName(filePath, exprSpan, t.text);
    }
    if (t.kind === 'op' && (t.text === '+' || t.text === '-' || t.text === '~')) {
      idx++;
      const inner = parsePrimary();
      if (!inner) return undefined;
      return { kind: 'ImmUnary', span: exprSpan, op: t.text as any, expr: inner };
    }
    if (t.kind === 'lparen') {
      idx++;
      const inner = parseExpr(1);
      if (!inner) return undefined;
      if (tokens[idx]?.kind !== 'rparen') return undefined;
      idx++;
      return inner;
    }
    return undefined;
  }

  const root = parseExpr(1);
  if (!root || idx !== tokens.length) {
    diag(diagnostics, filePath, `Invalid imm expression: ${exprText}`, {
      line: exprSpan.start.line,
      column: exprSpan.start.column,
    });
    return undefined;
  }
  return root;
}

function parseAsmOperand(
  filePath: string,
  operandText: string,
  operandSpan: SourceSpan,
  diagnostics: Diagnostic[],
): AsmOperandNode | undefined {
  const t = operandText.trim();
  if (t.length === 0) return undefined;

  if (/^(A|B|C|D|E|H|L|HL|DE|BC|SP|IX|IY|AF|I|R)$/i.test(t)) {
    return { kind: 'Reg', span: operandSpan, name: t };
  }

  const n = parseNumberLiteral(t);
  if (n !== undefined) {
    return { kind: 'Imm', span: operandSpan, expr: immLiteral(filePath, operandSpan, n) };
  }

  const expr = parseImmExprFromText(filePath, t, operandSpan, diagnostics);
  if (expr) {
    return { kind: 'Imm', span: operandSpan, expr };
  }

  diag(diagnostics, filePath, `Unsupported operand in PR2 subset: ${t}`, {
    line: operandSpan.start.line,
    column: operandSpan.start.column,
  });
  return undefined;
}

function parseAsmInstruction(
  filePath: string,
  text: string,
  instrSpan: SourceSpan,
  diagnostics: Diagnostic[],
): AsmInstructionNode | undefined {
  const trimmed = text.trim();
  if (trimmed.length === 0) return undefined;
  const firstSpace = trimmed.search(/\s/);
  const head = firstSpace === -1 ? trimmed : trimmed.slice(0, firstSpace);
  const rest = firstSpace === -1 ? '' : trimmed.slice(firstSpace).trim();

  const operands: AsmOperandNode[] = [];
  if (rest.length > 0) {
    const parts = rest.split(',').map((p) => p.trim());
    for (const part of parts) {
      const opNode = parseAsmOperand(filePath, part, instrSpan, diagnostics);
      if (opNode) operands.push(opNode);
    }
  }

  return { kind: 'AsmInstruction', span: instrSpan, head, operands };
}

/**
 * Parse a ZAX program from a single in-memory source file.
 *
 * PR2 implementation note:
 * - Supports a minimal single-file subset: `const`, `data`, and `func ... asm ... end`.
 * - `imm` expressions are supported for `const` values and immediate operands.
 * - On errors, diagnostics are appended to `diagnostics`; parsing continues best-effort.
 */
export function parseProgram(
  entryFile: string,
  sourceText: string,
  diagnostics: Diagnostic[],
): ProgramNode {
  const file = makeSourceFile(entryFile, sourceText);
  const lineCount = file.lineStarts.length;

  function getRawLine(lineIndex: number): { raw: string; startOffset: number; endOffset: number } {
    const startOffset = file.lineStarts[lineIndex] ?? 0;
    const nextStart = file.lineStarts[lineIndex + 1] ?? file.text.length;
    let rawWithEol = file.text.slice(startOffset, nextStart);
    if (rawWithEol.endsWith('\n')) rawWithEol = rawWithEol.slice(0, -1);
    if (rawWithEol.endsWith('\r')) rawWithEol = rawWithEol.slice(0, -1);
    return { raw: rawWithEol, startOffset, endOffset: startOffset + rawWithEol.length };
  }

  const items: ModuleItemNode[] = [];

  let i = 0;
  while (i < lineCount) {
    const { raw, startOffset: lineStartOffset, endOffset: lineEndOffset } = getRawLine(i);
    const text = stripComment(raw).trim();
    const lineNo = i + 1;
    if (text.length === 0) {
      i++;
      continue;
    }

    const exportPrefix = text.startsWith('export ') ? 'export ' : '';
    const rest = exportPrefix ? text.slice('export '.length).trimStart() : text;

    if (rest.startsWith('func ')) {
      const exported = exportPrefix.length > 0;
      const header = rest.slice('func '.length).trimStart();
      const m = /^([A-Za-z_][A-Za-z0-9_]*)\s*\(\s*\)\s*:\s*([A-Za-z_][A-Za-z0-9_]*)\s*$/.exec(
        header,
      );
      if (!m) {
        diag(
          diagnostics,
          entryFile,
          `Invalid func header (PR1 supports only "func name(): void")`,
          {
            line: lineNo,
            column: 1,
          },
        );
        i++;
        continue;
      }

      const name = m[1]!;
      const retType = m[2]!;
      if (retType !== 'void') {
        diag(diagnostics, entryFile, `PR1 supports only return type void`, {
          line: lineNo,
          column: 1,
        });
      }

      const funcStartOffset = lineStartOffset;
      const headerSpan = span(file, lineStartOffset, lineEndOffset);
      i++;

      /* Expect "asm". */
      let asmStartOffset: number | undefined;
      while (i < lineCount) {
        const { raw: raw2, startOffset: so2 } = getRawLine(i);
        const t2 = stripComment(raw2).trim();
        if (t2.length === 0) {
          i++;
          continue;
        }
        asmStartOffset = so2;
        if (t2 !== 'asm') {
          diag(diagnostics, entryFile, `PR1 expects "asm" immediately inside func`, {
            line: i + 1,
            column: 1,
          });
        }
        i++;
        break;
      }

      if (asmStartOffset === undefined) {
        diag(diagnostics, entryFile, `Unterminated func "${name}": expected "asm"`, {
          line: lineNo,
          column: 1,
        });
        break;
      }

      const asmItems: AsmItemNode[] = [];
      let terminated = false;
      while (i < lineCount) {
        const { raw: rawLine, startOffset: lineOffset, endOffset } = getRawLine(i);
        const withoutComment = stripComment(rawLine);
        const content = withoutComment.trim();
        if (content.length === 0) {
          i++;
          continue;
        }

        if (content === 'end') {
          terminated = true;
          const funcEndOffset = endOffset;
          const funcSpan = span(file, funcStartOffset, funcEndOffset);
          const asmSpan = span(file, asmStartOffset, funcEndOffset);
          const asm: AsmBlockNode = { kind: 'AsmBlock', span: asmSpan, items: asmItems };

          const returnTypeNode: TypeExprNode = { kind: 'TypeName', span: headerSpan, name: 'void' };

          const funcNode: FuncDeclNode = {
            kind: 'FuncDecl',
            span: funcSpan,
            name,
            exported,
            params: [],
            returnType: returnTypeNode,
            asm,
          };
          items.push(funcNode);
          i++;
          break;
        }

        const fullSpan = span(file, lineOffset, endOffset);

        /* label: */
        const labelMatch = /^([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(.*)$/.exec(content);
        if (labelMatch) {
          const label = labelMatch[1]!;
          const remainder = labelMatch[2] ?? '';
          const labelNode: AsmLabelNode = { kind: 'AsmLabel', span: fullSpan, name: label };
          asmItems.push(labelNode);
          if (remainder.trim().length > 0) {
            const instrNode = parseAsmInstruction(entryFile, remainder, fullSpan, diagnostics);
            if (instrNode) asmItems.push(instrNode);
          }
          i++;
          continue;
        }

        const instrNode = parseAsmInstruction(entryFile, content, fullSpan, diagnostics);
        if (instrNode) asmItems.push(instrNode);
        i++;
      }

      if (!terminated) {
        diag(diagnostics, entryFile, `Unterminated func "${name}": missing "end"`, {
          line: lineNo,
          column: 1,
        });
        break;
      }

      continue;
    }

    if (rest.startsWith('const ')) {
      const decl = rest.slice('const '.length).trimStart();
      const eq = decl.indexOf('=');
      if (eq < 0) {
        diag(diagnostics, entryFile, `Invalid const declaration`, { line: lineNo, column: 1 });
        i++;
        continue;
      }

      const name = decl.slice(0, eq).trim();
      const rhs = decl.slice(eq + 1).trim();
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
        diag(diagnostics, entryFile, `Invalid const name`, { line: lineNo, column: 1 });
        i++;
        continue;
      }

      const exprSpan = span(file, lineStartOffset, lineEndOffset);
      const expr = parseImmExprFromText(entryFile, rhs, exprSpan, diagnostics);
      if (!expr) {
        i++;
        continue;
      }

      const constNode: ConstDeclNode = {
        kind: 'ConstDecl',
        span: exprSpan,
        name,
        exported: exportPrefix.length > 0,
        value: expr,
      };
      items.push(constNode);
      i++;
      continue;
    }

    if (rest === 'data') {
      const blockStart = lineStartOffset;
      i++;
      const decls: DataDeclNode[] = [];

      const TOP_LEVEL_KEYWORDS = new Set([
        'func',
        'const',
        'enum',
        'data',
        'import',
        'type',
        'union',
        'var',
        'extern',
        'bin',
        'hex',
        'op',
        'section',
        'align',
      ]);

      const isTopLevelStart = (t: string): boolean => {
        const w = t.startsWith('export ') ? t.slice('export '.length).trimStart() : t;
        const keyword = w.split(/\s/, 1)[0] ?? '';
        return TOP_LEVEL_KEYWORDS.has(keyword);
      };

      while (i < lineCount) {
        const { raw: rawDecl, startOffset: so, endOffset: eo } = getRawLine(i);
        const t = stripComment(rawDecl).trim();
        if (t.length === 0) {
          i++;
          continue;
        }
        if (isTopLevelStart(t)) break;

        const m = /^([A-Za-z_][A-Za-z0-9_]*)\s*:\s*([^=]+?)\s*=\s*(.+)$/.exec(t);
        if (!m) {
          diag(diagnostics, entryFile, `Invalid data declaration`, { line: i + 1, column: 1 });
          i++;
          continue;
        }

        const name = m[1]!;
        const typeText = m[2]!.trim();
        const initText = m[3]!.trim();

        const lineSpan = span(file, so, eo);

        let typeExpr: TypeExprNode | undefined;
        const arrMatch = /^([A-Za-z_][A-Za-z0-9_]*)\s*\[\s*([0-9]+)\s*\]\s*$/.exec(typeText);
        if (arrMatch) {
          const base = arrMatch[1]!;
          const len = Number.parseInt(arrMatch[2]!, 10);
          typeExpr = {
            kind: 'ArrayType',
            span: lineSpan,
            element: { kind: 'TypeName', span: lineSpan, name: base },
            length: len,
          };
        } else if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(typeText)) {
          typeExpr = { kind: 'TypeName', span: lineSpan, name: typeText };
        }

        if (!typeExpr) {
          diag(diagnostics, entryFile, `Unsupported type in data declaration`, {
            line: i + 1,
            column: 1,
          });
          i++;
          continue;
        }

        let initializer: DataDeclNode['initializer'] | undefined;
        if (initText.startsWith('"') && initText.endsWith('"') && initText.length >= 2) {
          initializer = { kind: 'InitString', span: lineSpan, value: initText.slice(1, -1) };
        } else if (initText.startsWith('[') && initText.endsWith(']')) {
          const inner = initText.slice(1, -1).trim();
          const parts = inner.length === 0 ? [] : inner.split(',').map((p) => p.trim());
          const elements: ImmExprNode[] = [];
          for (const part of parts) {
            const e = parseImmExprFromText(entryFile, part, lineSpan, diagnostics);
            if (e) elements.push(e);
          }
          initializer = { kind: 'InitArray', span: lineSpan, elements };
        } else {
          const e = parseImmExprFromText(entryFile, initText, lineSpan, diagnostics);
          if (e) initializer = { kind: 'InitArray', span: lineSpan, elements: [e] };
        }

        if (!initializer) {
          i++;
          continue;
        }

        const declNode: DataDeclNode = {
          kind: 'DataDecl',
          span: lineSpan,
          name,
          typeExpr,
          initializer,
        };
        decls.push(declNode);
        i++;
      }

      const blockEnd = i < lineCount ? (getRawLine(i).startOffset ?? blockStart) : file.text.length;
      const dataBlock: DataBlockNode = {
        kind: 'DataBlock',
        span: span(file, blockStart, blockEnd),
        decls,
      };
      items.push(dataBlock);
      continue;
    }

    diag(diagnostics, entryFile, `Unsupported top-level construct in PR2 subset: ${text}`, {
      line: lineNo,
      column: 1,
    });
    i++;
  }

  const moduleSpan = span(file, 0, sourceText.length);
  const moduleFile: ModuleFileNode = {
    kind: 'ModuleFile',
    span: moduleSpan,
    path: entryFile,
    items,
  };

  const program: ProgramNode = {
    kind: 'Program',
    span: moduleSpan,
    entryFile,
    files: [moduleFile],
  };

  return program;
}

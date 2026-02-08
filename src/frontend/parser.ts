import type {
  AlignDirectiveNode,
  ImportNode,
  AsmBlockNode,
  AsmInstructionNode,
  AsmItemNode,
  AsmLabelNode,
  AsmOperandNode,
  ConstDeclNode,
  DataBlockNode,
  DataDeclNode,
  EnumDeclNode,
  EaExprNode,
  EaIndexNode,
  ExternDeclNode,
  ExternFuncNode,
  FuncDeclNode,
  ImmExprNode,
  ModuleFileNode,
  ModuleItemNode,
  OpDeclNode,
  OpMatcherNode,
  OpParamNode,
  ParamNode,
  ProgramNode,
  RecordFieldNode,
  SectionDirectiveNode,
  SourceSpan,
  TypeDeclNode,
  TypeExprNode,
  VarBlockNode,
  VarDeclNode,
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
    id: DiagnosticIds.ParseError,
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

/**
 * Parse a PR3 type-expression from a single line of text.
 *
 * Supported in the PR3 subset:
 * - Named types (including scalars like `byte`, `word`, `addr`)
 * - Fixed-length array suffixes like `byte[16]` or `Point[4]`
 */
function parseTypeExprFromText(typeText: string, typeSpan: SourceSpan): TypeExprNode | undefined {
  let rest = typeText.trim();
  const nameMatch = /^([A-Za-z_][A-Za-z0-9_]*)/.exec(rest);
  if (!nameMatch) return undefined;
  const name = nameMatch[1]!;
  rest = rest.slice(name.length).trimStart();

  let typeExpr: TypeExprNode = { kind: 'TypeName', span: typeSpan, name };

  while (rest.startsWith('[')) {
    const m = /^\[\s*([0-9]+)\s*\]/.exec(rest);
    if (!m) return undefined;
    const len = Number.parseInt(m[1]!, 10);
    typeExpr = { kind: 'ArrayType', span: typeSpan, element: typeExpr, length: len };
    rest = rest.slice(m[0].length).trimStart();
  }

  if (rest.length > 0) return undefined;
  return typeExpr;
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
  | { kind: 'rparen' }
  | { kind: 'lbrack' }
  | { kind: 'rbrack' };

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
    if (ch === '[') {
      out.push({ kind: 'lbrack' });
      i++;
      continue;
    }
    if (ch === ']') {
      out.push({ kind: 'rbrack' });
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
      if (t.text === 'sizeof' && tokens[idx + 1]?.kind === 'lparen') {
        idx += 2; // sizeof (
        const arg = tokens[idx];
        if (!arg || arg.kind !== 'ident') return undefined;
        idx++;

        let typeExpr: TypeExprNode = { kind: 'TypeName', span: exprSpan, name: arg.text };
        while (tokens[idx]?.kind === 'lbrack') {
          idx++;
          const lenTok = tokens[idx];
          if (!lenTok || lenTok.kind !== 'num') return undefined;
          if (!/^[0-9]+$/.test(lenTok.text)) return undefined;
          const len = Number.parseInt(lenTok.text, 10);
          idx++;
          if (tokens[idx]?.kind !== 'rbrack') return undefined;
          idx++;
          typeExpr = { kind: 'ArrayType', span: exprSpan, element: typeExpr, length: len };
        }

        if (tokens[idx]?.kind !== 'rparen') return undefined;
        idx++;
        return {
          kind: 'ImmSizeof',
          span: exprSpan,
          typeExpr,
        };
      }
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

/**
 * Parse the `[...]` index portion of an EA expression (PR3 subset).
 *
 * Supported:
 * - 8-bit registers (`A`..`L`)
 * - `HL` (memory through HL)
 * - Immediate expressions (reusing the `imm` parser)
 */
function parseEaIndexFromText(
  filePath: string,
  indexText: string,
  indexSpan: SourceSpan,
  diagnostics: Diagnostic[],
): EaIndexNode | undefined {
  const t = indexText.trim();
  if (t.toUpperCase() === 'HL') return { kind: 'IndexMemHL', span: indexSpan };
  if (/^(A|B|C|D|E|H|L)$/i.test(t)) return { kind: 'IndexReg8', span: indexSpan, reg: t };

  const imm = parseImmExprFromText(filePath, t, indexSpan, diagnostics);
  if (!imm) return undefined;
  return { kind: 'IndexImm', span: indexSpan, value: imm };
}

/**
 * Parse an effective-address expression from text (PR3 subset).
 *
 * Supported:
 * - `name`
 * - field access: `name.field`
 * - indexing: `name[idx]`
 * - trailing offset: `+ imm` / `- imm`
 */
function parseEaExprFromText(
  filePath: string,
  exprText: string,
  exprSpan: SourceSpan,
  diagnostics: Diagnostic[],
): EaExprNode | undefined {
  let rest = exprText.trim();
  const baseMatch = /^([A-Za-z_][A-Za-z0-9_]*)/.exec(rest);
  if (!baseMatch) return undefined;
  let expr: EaExprNode = { kind: 'EaName', span: exprSpan, name: baseMatch[1]! };
  rest = rest.slice(baseMatch[0].length).trimStart();

  while (rest.length > 0) {
    if (rest.startsWith('.')) {
      const m = /^\.([A-Za-z_][A-Za-z0-9_]*)/.exec(rest);
      if (!m) return undefined;
      expr = { kind: 'EaField', span: exprSpan, base: expr, field: m[1]! };
      rest = rest.slice(m[0].length).trimStart();
      continue;
    }
    if (rest.startsWith('[')) {
      /* TODO: handle nested brackets like `arr[table[0]]` (PR3 does not need this yet). */
      const close = rest.indexOf(']');
      if (close < 0) return undefined;
      const inside = rest.slice(1, close);
      const index = parseEaIndexFromText(filePath, inside, exprSpan, diagnostics);
      if (!index) return undefined;
      expr = { kind: 'EaIndex', span: exprSpan, base: expr, index };
      rest = rest.slice(close + 1).trimStart();
      continue;
    }
    break;
  }

  // Optional offset: `+ imm` or `- imm` at the end.
  if (rest.length > 0) {
    const m = /^([+-])\s*(.+)$/.exec(rest);
    if (!m) return undefined;
    const off = parseImmExprFromText(filePath, m[2]!, exprSpan, diagnostics);
    if (!off) return undefined;
    expr =
      m[1] === '+'
        ? { kind: 'EaAdd', span: exprSpan, base: expr, offset: off }
        : { kind: 'EaSub', span: exprSpan, base: expr, offset: off };
    rest = '';
  }

  return rest.length === 0 ? expr : undefined;
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

  if (t.startsWith('(') && t.endsWith(')')) {
    const inner = t.slice(1, -1).trim();
    const ea = parseEaExprFromText(filePath, inner, operandSpan, diagnostics);
    if (ea) return { kind: 'Mem', span: operandSpan, expr: ea };
  }
  if (t.includes('.') || t.includes('[')) {
    const ea = parseEaExprFromText(filePath, t, operandSpan, diagnostics);
    if (ea) return { kind: 'Ea', span: operandSpan, expr: ea };
  }

  const expr = parseImmExprFromText(filePath, t, operandSpan, diagnostics);
  if (expr) {
    return { kind: 'Imm', span: operandSpan, expr };
  }

  diag(diagnostics, filePath, `Unsupported operand in PR3 subset: ${t}`, {
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

type AsmControlFrame = 'If' | 'While' | 'Repeat' | 'Select';

function parseAsmStatement(
  filePath: string,
  text: string,
  stmtSpan: SourceSpan,
  diagnostics: Diagnostic[],
  controlStack: AsmControlFrame[],
): AsmItemNode | undefined {
  const trimmed = text.trim();
  const lower = trimmed.toLowerCase();

  if (lower === 'repeat') {
    controlStack.push('Repeat');
    return { kind: 'Repeat', span: stmtSpan };
  }

  if (lower === 'else') {
    const top = controlStack[controlStack.length - 1];
    if (top === 'Select') return { kind: 'SelectElse', span: stmtSpan };
    if (top !== 'If') {
      diag(diagnostics, filePath, `"else" without matching "if" or "select"`, {
        line: stmtSpan.start.line,
        column: stmtSpan.start.column,
      });
    }
    return { kind: 'Else', span: stmtSpan };
  }

  if (lower === 'end') {
    const top = controlStack.pop();
    if (!top) {
      diag(diagnostics, filePath, `Unexpected "end" in asm block`, {
        line: stmtSpan.start.line,
        column: stmtSpan.start.column,
      });
      return undefined;
    }
    if (top === 'Repeat') {
      diag(diagnostics, filePath, `"repeat" blocks must close with "until <cc>"`, {
        line: stmtSpan.start.line,
        column: stmtSpan.start.column,
      });
    }
    return { kind: 'End', span: stmtSpan };
  }

  const ifMatch = /^if\s+([A-Za-z][A-Za-z0-9]*)$/i.exec(trimmed);
  if (ifMatch) {
    const cc = ifMatch[1]!;
    controlStack.push('If');
    return { kind: 'If', span: stmtSpan, cc };
  }

  const whileMatch = /^while\s+([A-Za-z][A-Za-z0-9]*)$/i.exec(trimmed);
  if (whileMatch) {
    const cc = whileMatch[1]!;
    controlStack.push('While');
    return { kind: 'While', span: stmtSpan, cc };
  }

  const untilMatch = /^until\s+([A-Za-z][A-Za-z0-9]*)$/i.exec(trimmed);
  if (untilMatch) {
    const cc = untilMatch[1]!;
    const top = controlStack.pop();
    if (top !== 'Repeat') {
      diag(diagnostics, filePath, `"until" without matching "repeat"`, {
        line: stmtSpan.start.line,
        column: stmtSpan.start.column,
      });
    }
    return { kind: 'Until', span: stmtSpan, cc };
  }

  const selectMatch = /^select\s+(.+)$/i.exec(trimmed);
  if (selectMatch) {
    const selectorText = selectMatch[1]!.trim();
    const selector = parseAsmOperand(filePath, selectorText, stmtSpan, diagnostics);
    if (!selector) {
      diag(diagnostics, filePath, `Invalid select selector`, {
        line: stmtSpan.start.line,
        column: stmtSpan.start.column,
      });
      return undefined;
    }
    controlStack.push('Select');
    return { kind: 'Select', span: stmtSpan, selector };
  }

  const caseMatch = /^case\s+(.+)$/i.exec(trimmed);
  if (caseMatch) {
    const exprText = caseMatch[1]!.trim();
    const value = parseImmExprFromText(filePath, exprText, stmtSpan, diagnostics);
    if (!value) {
      diag(diagnostics, filePath, `Invalid case value`, {
        line: stmtSpan.start.line,
        column: stmtSpan.start.column,
      });
      return undefined;
    }
    return { kind: 'Case', span: stmtSpan, value };
  }

  return parseAsmInstruction(filePath, trimmed, stmtSpan, diagnostics);
}

function parseParamsFromText(
  filePath: string,
  paramsText: string,
  paramsSpan: SourceSpan,
  diagnostics: Diagnostic[],
): ParamNode[] | undefined {
  const trimmed = paramsText.trim();
  if (trimmed.length === 0) return [];

  const parts = trimmed.split(',').map((p) => p.trim());
  const out: ParamNode[] = [];
  for (const part of parts) {
    const m = /^([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(.+)$/.exec(part);
    if (!m) {
      diag(diagnostics, filePath, `Invalid parameter declaration`, {
        line: paramsSpan.start.line,
        column: paramsSpan.start.column,
      });
      return undefined;
    }

    const name = m[1]!;
    const typeText = m[2]!.trim();
    const typeExpr = parseTypeExprFromText(typeText, paramsSpan);
    if (!typeExpr) {
      diag(diagnostics, filePath, `Unsupported type in parameter declaration`, {
        line: paramsSpan.start.line,
        column: paramsSpan.start.column,
      });
      return undefined;
    }
    if (typeExpr.kind === 'TypeName' && typeExpr.name === 'void') {
      diag(diagnostics, filePath, `Parameter "${name}" may not have type void`, {
        line: paramsSpan.start.line,
        column: paramsSpan.start.column,
      });
      return undefined;
    }

    out.push({ kind: 'Param', span: paramsSpan, name, typeExpr });
  }
  return out;
}

function parseOpMatcherFromText(matcherText: string, matcherSpan: SourceSpan): OpMatcherNode {
  const t = matcherText.trim();
  const lower = t.toLowerCase();
  switch (lower) {
    case 'reg8':
      return { kind: 'MatcherReg8', span: matcherSpan };
    case 'reg16':
      return { kind: 'MatcherReg16', span: matcherSpan };
    case 'imm8':
      return { kind: 'MatcherImm8', span: matcherSpan };
    case 'imm16':
      return { kind: 'MatcherImm16', span: matcherSpan };
    case 'ea':
      return { kind: 'MatcherEa', span: matcherSpan };
    case 'mem8':
      return { kind: 'MatcherMem8', span: matcherSpan };
    case 'mem16':
      return { kind: 'MatcherMem16', span: matcherSpan };
    default:
      return { kind: 'MatcherFixed', span: matcherSpan, token: t };
  }
}

function parseOpParamsFromText(
  filePath: string,
  paramsText: string,
  paramsSpan: SourceSpan,
  diagnostics: Diagnostic[],
): OpParamNode[] | undefined {
  const trimmed = paramsText.trim();
  if (trimmed.length === 0) return [];

  const parts = trimmed.split(',').map((p) => p.trim());
  const out: OpParamNode[] = [];
  for (const part of parts) {
    const m = /^([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(.+)$/.exec(part);
    if (!m) {
      diag(diagnostics, filePath, `Invalid op parameter declaration`, {
        line: paramsSpan.start.line,
        column: paramsSpan.start.column,
      });
      return undefined;
    }

    const name = m[1]!;
    const matcherText = m[2]!.trim();
    out.push({
      kind: 'OpParam',
      span: paramsSpan,
      name,
      matcher: parseOpMatcherFromText(matcherText, paramsSpan),
    });
  }
  return out;
}

/**
 * Parse a single `.zax` module file from an in-memory source string.
 *
 * Implementation note:
 * - Parsing is best-effort: on errors, diagnostics are appended and parsing continues.
 * - The module may include `import` statements, but import resolution/loading is handled by the compiler.
 */
export function parseModuleFile(
  modulePath: string,
  sourceText: string,
  diagnostics: Diagnostic[],
): ModuleFileNode {
  const file = makeSourceFile(modulePath, sourceText);
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

  function isTopLevelStart(t: string): boolean {
    const w = t.startsWith('export ') ? t.slice('export '.length).trimStart() : t;
    const keyword = w.split(/\s/, 1)[0] ?? '';
    return TOP_LEVEL_KEYWORDS.has(keyword);
  }

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

    if (rest.startsWith('import ')) {
      if (exportPrefix.length > 0) {
        diag(diagnostics, modulePath, `export not supported on import statements`, {
          line: lineNo,
          column: 1,
        });
        i++;
        continue;
      }

      const spec = rest.slice('import '.length).trim();
      const stmtSpan = span(file, lineStartOffset, lineEndOffset);
      if (spec.startsWith('"') && spec.endsWith('"') && spec.length >= 2) {
        const importNode: ImportNode = {
          kind: 'Import',
          span: stmtSpan,
          specifier: spec.slice(1, -1),
          form: 'path',
        };
        items.push(importNode);
        i++;
        continue;
      }
      if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(spec)) {
        const importNode: ImportNode = {
          kind: 'Import',
          span: stmtSpan,
          specifier: spec,
          form: 'moduleId',
        };
        items.push(importNode);
        i++;
        continue;
      }
      diag(diagnostics, modulePath, `Invalid import statement`, { line: lineNo, column: 1 });
      i++;
      continue;
    }

    if (rest.startsWith('type ')) {
      const name = rest.slice('type '.length).trim();
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
        diag(diagnostics, modulePath, `Invalid type name`, { line: lineNo, column: 1 });
        i++;
        continue;
      }

      const typeStart = lineStartOffset;
      const fields: RecordFieldNode[] = [];
      let terminated = false;
      let typeEndOffset = file.text.length;
      i++;

      while (i < lineCount) {
        const { raw: rawField, startOffset: so, endOffset: eo } = getRawLine(i);
        const t = stripComment(rawField).trim();
        if (t.length === 0) {
          i++;
          continue;
        }
        if (t === 'end') {
          terminated = true;
          typeEndOffset = eo;
          i++;
          break;
        }

        const m = /^([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(.+)$/.exec(t);
        if (!m) {
          diag(diagnostics, modulePath, `Invalid record field declaration`, {
            line: i + 1,
            column: 1,
          });
          i++;
          continue;
        }

        const fieldName = m[1]!;
        const typeText = m[2]!.trim();
        const fieldSpan = span(file, so, eo);
        const typeExpr = parseTypeExprFromText(typeText, fieldSpan);
        if (!typeExpr) {
          diag(diagnostics, modulePath, `Unsupported field type`, { line: i + 1, column: 1 });
          i++;
          continue;
        }

        fields.push({
          kind: 'RecordField',
          span: fieldSpan,
          name: fieldName,
          typeExpr,
        });
        i++;
      }

      if (!terminated) {
        diag(diagnostics, modulePath, `Unterminated type "${name}": missing "end"`, {
          line: lineNo,
          column: 1,
        });
      }

      const typeEnd = terminated ? typeEndOffset : file.text.length;
      const typeSpan = span(file, typeStart, typeEnd);
      const typeNode: TypeDeclNode = {
        kind: 'TypeDecl',
        span: typeSpan,
        name,
        typeExpr: { kind: 'RecordType', span: typeSpan, fields },
      };
      items.push(typeNode);
      continue;
    }

    if (rest === 'var') {
      const blockStart = lineStartOffset;
      i++;
      const decls: VarDeclNode[] = [];

      while (i < lineCount) {
        const { raw: rawDecl, startOffset: so, endOffset: eo } = getRawLine(i);
        const t = stripComment(rawDecl).trim();
        if (t.length === 0) {
          i++;
          continue;
        }
        if (isTopLevelStart(t)) {
          const m = /^([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(.+)$/.exec(t);
          if (m && TOP_LEVEL_KEYWORDS.has(m[1]!)) {
            diag(
              diagnostics,
              modulePath,
              `Invalid var declaration name "${m[1]!}": collides with a top-level keyword.`,
              { line: i + 1, column: 1 },
            );
          }
          break;
        }

        const m = /^([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(.+)$/.exec(t);
        if (!m) {
          diag(diagnostics, modulePath, `Invalid var declaration`, { line: i + 1, column: 1 });
          i++;
          continue;
        }

        const name = m[1]!;
        const typeText = m[2]!.trim();
        const declSpan = span(file, so, eo);
        const typeExpr = parseTypeExprFromText(typeText, declSpan);
        if (!typeExpr) {
          diag(diagnostics, modulePath, `Unsupported type in var declaration`, {
            line: i + 1,
            column: 1,
          });
          i++;
          continue;
        }

        decls.push({ kind: 'VarDecl', span: declSpan, name, typeExpr });
        i++;
      }

      const blockEnd = i < lineCount ? (getRawLine(i).startOffset ?? blockStart) : file.text.length;
      const varBlock: VarBlockNode = {
        kind: 'VarBlock',
        span: span(file, blockStart, blockEnd),
        scope: 'module',
        decls,
      };
      items.push(varBlock);
      continue;
    }

    if (rest.startsWith('func ')) {
      const exported = exportPrefix.length > 0;
      const header = rest.slice('func '.length).trimStart();
      const openParen = header.indexOf('(');
      const closeParen = header.lastIndexOf(')');
      if (openParen < 0 || closeParen < openParen) {
        diag(diagnostics, modulePath, `Invalid func header`, { line: lineNo, column: 1 });
        i++;
        continue;
      }

      const name = header.slice(0, openParen).trim();
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
        diag(diagnostics, modulePath, `Invalid func name`, { line: lineNo, column: 1 });
        i++;
        continue;
      }

      const afterClose = header.slice(closeParen + 1).trimStart();
      const retMatch = /^:\s*(.+)$/.exec(afterClose);
      if (!retMatch) {
        diag(diagnostics, modulePath, `Invalid func header: missing return type`, {
          line: lineNo,
          column: 1,
        });
        i++;
        continue;
      }

      const funcStartOffset = lineStartOffset;
      const headerSpan = span(file, lineStartOffset, lineEndOffset);
      const paramsText = header.slice(openParen + 1, closeParen);
      const params = parseParamsFromText(modulePath, paramsText, headerSpan, diagnostics);
      if (!params) {
        i++;
        continue;
      }

      const retTypeText = retMatch[1]!.trim();
      const returnType = parseTypeExprFromText(retTypeText, headerSpan);
      if (!returnType) {
        diag(diagnostics, modulePath, `Unsupported return type`, { line: lineNo, column: 1 });
        i++;
        continue;
      }
      i++;

      // Optional function-local `var` block, then required `asm`.
      let locals: VarBlockNode | undefined;
      let asmStartOffset: number | undefined;
      while (i < lineCount) {
        const { raw: raw2, startOffset: so2 } = getRawLine(i);
        const t2 = stripComment(raw2).trim();
        if (t2.length === 0) {
          i++;
          continue;
        }

        if (t2 === 'var') {
          const varStart = so2;
          i++;
          const decls: VarDeclNode[] = [];

          while (i < lineCount) {
            const { raw: rawDecl, startOffset: soDecl, endOffset: eoDecl } = getRawLine(i);
            const tDecl = stripComment(rawDecl).trim();
            if (tDecl.length === 0) {
              i++;
              continue;
            }
            if (tDecl === 'asm') {
              asmStartOffset = soDecl;
              locals = {
                kind: 'VarBlock',
                span: span(file, varStart, soDecl),
                scope: 'function',
                decls,
              };
              i++; // consume asm
              break;
            }

            const m = /^([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(.+)$/.exec(tDecl);
            if (!m) {
              diag(diagnostics, modulePath, `Invalid var declaration`, { line: i + 1, column: 1 });
              i++;
              continue;
            }

            const localName = m[1]!;
            const typeText = m[2]!.trim();
            const declSpan = span(file, soDecl, eoDecl);
            const typeExpr = parseTypeExprFromText(typeText, declSpan);
            if (!typeExpr) {
              diag(diagnostics, modulePath, `Unsupported type in var declaration`, {
                line: i + 1,
                column: 1,
              });
              i++;
              continue;
            }

            decls.push({ kind: 'VarDecl', span: declSpan, name: localName, typeExpr });
            i++;
          }
          break;
        }

        if (t2 !== 'asm') {
          diag(diagnostics, modulePath, `Expected "asm" inside func (optionally after "var")`, {
            line: i + 1,
            column: 1,
          });
          i++;
          continue;
        }
        asmStartOffset = so2;
        i++;
        break;
      }

      if (asmStartOffset === undefined) {
        diag(diagnostics, modulePath, `Unterminated func "${name}": expected "asm"`, {
          line: lineNo,
          column: 1,
        });
        break;
      }

      const asmItems: AsmItemNode[] = [];
      const asmControlStack: AsmControlFrame[] = [];
      let terminated = false;
      while (i < lineCount) {
        const { raw: rawLine, startOffset: lineOffset, endOffset } = getRawLine(i);
        const withoutComment = stripComment(rawLine);
        const content = withoutComment.trim();
        if (content.length === 0) {
          i++;
          continue;
        }

        if (content === 'end' && asmControlStack.length === 0) {
          terminated = true;
          const funcEndOffset = endOffset;
          const funcSpan = span(file, funcStartOffset, funcEndOffset);
          const asmSpan = span(file, asmStartOffset, funcEndOffset);
          const asm: AsmBlockNode = { kind: 'AsmBlock', span: asmSpan, items: asmItems };

          const funcNode: FuncDeclNode = {
            kind: 'FuncDecl',
            span: funcSpan,
            name,
            exported,
            params,
            returnType,
            ...(locals ? { locals } : {}),
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
            const stmtNode = parseAsmStatement(
              modulePath,
              remainder,
              fullSpan,
              diagnostics,
              asmControlStack,
            );
            if (stmtNode) asmItems.push(stmtNode);
          }
          i++;
          continue;
        }

        const stmtNode = parseAsmStatement(
          modulePath,
          content,
          fullSpan,
          diagnostics,
          asmControlStack,
        );
        if (stmtNode) asmItems.push(stmtNode);
        i++;
      }

      if (!terminated) {
        diag(diagnostics, modulePath, `Unterminated func "${name}": missing "end"`, {
          line: lineNo,
          column: 1,
        });
        break;
      }

      continue;
    }

    if (rest.startsWith('op ')) {
      const exported = exportPrefix.length > 0;
      const header = rest.slice('op '.length).trimStart();
      const openParen = header.indexOf('(');
      const closeParen = header.lastIndexOf(')');
      if (openParen < 0 || closeParen < openParen) {
        diag(diagnostics, modulePath, `Invalid op header`, { line: lineNo, column: 1 });
        i++;
        continue;
      }

      const name = header.slice(0, openParen).trim();
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
        diag(diagnostics, modulePath, `Invalid op name`, { line: lineNo, column: 1 });
        i++;
        continue;
      }

      const trailing = header.slice(closeParen + 1).trim();
      if (trailing.length > 0) {
        diag(diagnostics, modulePath, `Invalid op header: unexpected trailing tokens`, {
          line: lineNo,
          column: 1,
        });
        i++;
        continue;
      }

      const opStartOffset = lineStartOffset;
      const headerSpan = span(file, lineStartOffset, lineEndOffset);
      const paramsText = header.slice(openParen + 1, closeParen);
      const params = parseOpParamsFromText(modulePath, paramsText, headerSpan, diagnostics);
      if (!params) {
        i++;
        continue;
      }
      i++;

      const bodyItems: AsmItemNode[] = [];
      const controlStack: AsmControlFrame[] = [];
      let terminated = false;
      let opEndOffset = file.text.length;
      while (i < lineCount) {
        const { raw: rawLine, startOffset: so, endOffset: eo } = getRawLine(i);
        const content = stripComment(rawLine).trim();
        if (content.length === 0) {
          i++;
          continue;
        }
        if (content === 'end' && controlStack.length === 0) {
          terminated = true;
          opEndOffset = eo;
          i++;
          break;
        }

        const fullSpan = span(file, so, eo);
        const labelMatch = /^([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(.*)$/.exec(content);
        if (labelMatch) {
          const label = labelMatch[1]!;
          const remainder = labelMatch[2] ?? '';
          bodyItems.push({ kind: 'AsmLabel', span: fullSpan, name: label });
          if (remainder.trim().length > 0) {
            const stmt = parseAsmStatement(
              modulePath,
              remainder,
              fullSpan,
              diagnostics,
              controlStack,
            );
            if (stmt) bodyItems.push(stmt);
          }
          i++;
          continue;
        }

        const stmt = parseAsmStatement(modulePath, content, fullSpan, diagnostics, controlStack);
        if (stmt) bodyItems.push(stmt);
        i++;
      }

      if (!terminated) {
        diag(diagnostics, modulePath, `Unterminated op "${name}": missing "end"`, {
          line: lineNo,
          column: 1,
        });
      }

      items.push({
        kind: 'OpDecl',
        span: span(file, opStartOffset, opEndOffset),
        name,
        exported,
        params,
        body: { kind: 'AsmBlock', span: span(file, opStartOffset, opEndOffset), items: bodyItems },
      } as OpDeclNode);
      continue;
    }

    if (rest.startsWith('extern ')) {
      if (exportPrefix.length > 0) {
        diag(diagnostics, modulePath, `export not supported on extern declarations`, {
          line: lineNo,
          column: 1,
        });
        i++;
        continue;
      }

      const decl = rest.slice('extern '.length).trimStart();
      if (!decl.startsWith('func ')) {
        diag(
          diagnostics,
          modulePath,
          `Unsupported extern declaration in current subset (expected "extern func ...")`,
          { line: lineNo, column: 1 },
        );
        i++;
        continue;
      }

      const header = decl.slice('func '.length).trimStart();
      const openParen = header.indexOf('(');
      const closeParen = header.lastIndexOf(')');
      if (openParen < 0 || closeParen < openParen) {
        diag(diagnostics, modulePath, `Invalid extern func declaration`, {
          line: lineNo,
          column: 1,
        });
        i++;
        continue;
      }

      const name = header.slice(0, openParen).trim();
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
        diag(diagnostics, modulePath, `Invalid extern func name`, { line: lineNo, column: 1 });
        i++;
        continue;
      }

      const afterClose = header.slice(closeParen + 1).trimStart();
      const m = /^:\s*(.+?)\s+at\s+(.+)$/.exec(afterClose);
      if (!m) {
        diag(
          diagnostics,
          modulePath,
          `Invalid extern func declaration: expected ": <retType> at <imm16>"`,
          { line: lineNo, column: 1 },
        );
        i++;
        continue;
      }

      const stmtSpan = span(file, lineStartOffset, lineEndOffset);
      const paramsText = header.slice(openParen + 1, closeParen);
      const params = parseParamsFromText(modulePath, paramsText, stmtSpan, diagnostics);
      if (!params) {
        i++;
        continue;
      }

      const retTypeText = m[1]!.trim();
      const returnType = parseTypeExprFromText(retTypeText, stmtSpan);
      if (!returnType) {
        diag(diagnostics, modulePath, `Unsupported extern func return type`, {
          line: lineNo,
          column: 1,
        });
        i++;
        continue;
      }

      const atText = m[2]!.trim();
      const at = parseImmExprFromText(modulePath, atText, stmtSpan, diagnostics);
      if (!at) {
        i++;
        continue;
      }

      const externFunc: ExternFuncNode = {
        kind: 'ExternFunc',
        span: stmtSpan,
        name,
        params,
        returnType,
        at,
      };
      const externDecl: ExternDeclNode = {
        kind: 'ExternDecl',
        span: stmtSpan,
        funcs: [externFunc],
      };
      items.push(externDecl);
      i++;
      continue;
    }

    if (rest.startsWith('enum ')) {
      if (exportPrefix.length > 0) {
        diag(diagnostics, modulePath, `export not supported on enum declarations in PR4 subset`, {
          line: lineNo,
          column: 1,
        });
      }

      const decl = rest.slice('enum '.length).trimStart();
      const nameMatch = /^([A-Za-z_][A-Za-z0-9_]*)(?:\s+(.*))?$/.exec(decl);
      if (!nameMatch) {
        diag(diagnostics, modulePath, `Invalid enum declaration`, { line: lineNo, column: 1 });
        i++;
        continue;
      }

      const name = nameMatch[1]!;
      const membersText = (nameMatch[2] ?? '').trim();
      if (membersText.length === 0) {
        diag(diagnostics, modulePath, `Enum "${name}" must declare at least one member`, {
          line: lineNo,
          column: 1,
        });
        i++;
        continue;
      }

      const rawParts = membersText.split(',').map((p) => p.trim());
      if (rawParts.some((p) => p.length === 0)) {
        diag(diagnostics, modulePath, `Trailing commas are not permitted in enum member lists`, {
          line: lineNo,
          column: 1,
        });
        i++;
        continue;
      }

      const members: string[] = [];
      for (const m of rawParts) {
        if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(m)) {
          diag(diagnostics, modulePath, `Invalid enum member name`, { line: lineNo, column: 1 });
          continue;
        }
        members.push(m);
      }

      const enumSpan = span(file, lineStartOffset, lineEndOffset);
      const enumNode: EnumDeclNode = { kind: 'EnumDecl', span: enumSpan, name, members };
      items.push(enumNode);
      i++;
      continue;
    }

    if (rest === 'section' || rest.startsWith('section ')) {
      if (exportPrefix.length > 0) {
        diag(diagnostics, modulePath, `export not supported on section directives`, {
          line: lineNo,
          column: 1,
        });
        i++;
        continue;
      }

      const decl = rest === 'section' ? '' : rest.slice('section '.length).trimStart();
      const m = /^(code|data|var)(?:\s+at\s+(.+))?$/.exec(decl);
      if (!m) {
        diag(diagnostics, modulePath, `Invalid section directive`, { line: lineNo, column: 1 });
        i++;
        continue;
      }

      const section = m[1]! as SectionDirectiveNode['section'];
      const atText = m[2]?.trim();
      const dirSpan = span(file, lineStartOffset, lineEndOffset);
      const at = atText
        ? parseImmExprFromText(modulePath, atText, dirSpan, diagnostics)
        : undefined;

      const sectionNode: SectionDirectiveNode = {
        kind: 'Section',
        span: dirSpan,
        section,
        ...(at ? { at } : {}),
      };
      items.push(sectionNode);
      i++;
      continue;
    }

    if (rest === 'align' || rest.startsWith('align ')) {
      if (exportPrefix.length > 0) {
        diag(diagnostics, modulePath, `export not supported on align directives`, {
          line: lineNo,
          column: 1,
        });
        i++;
        continue;
      }

      const exprText = rest === 'align' ? '' : rest.slice('align '.length).trimStart();
      if (exprText.length === 0) {
        diag(diagnostics, modulePath, `Invalid align directive`, { line: lineNo, column: 1 });
        i++;
        continue;
      }
      const dirSpan = span(file, lineStartOffset, lineEndOffset);
      const value = parseImmExprFromText(modulePath, exprText, dirSpan, diagnostics);
      if (!value) {
        i++;
        continue;
      }
      const alignNode: AlignDirectiveNode = { kind: 'Align', span: dirSpan, value };
      items.push(alignNode);
      i++;
      continue;
    }

    if (rest.startsWith('const ')) {
      const decl = rest.slice('const '.length).trimStart();
      const eq = decl.indexOf('=');
      if (eq < 0) {
        diag(diagnostics, modulePath, `Invalid const declaration`, { line: lineNo, column: 1 });
        i++;
        continue;
      }

      const name = decl.slice(0, eq).trim();
      const rhs = decl.slice(eq + 1).trim();
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
        diag(diagnostics, modulePath, `Invalid const name`, { line: lineNo, column: 1 });
        i++;
        continue;
      }

      const exprSpan = span(file, lineStartOffset, lineEndOffset);
      const expr = parseImmExprFromText(modulePath, rhs, exprSpan, diagnostics);
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
          diag(diagnostics, modulePath, `Invalid data declaration`, { line: i + 1, column: 1 });
          i++;
          continue;
        }

        const name = m[1]!;
        const typeText = m[2]!.trim();
        const initText = m[3]!.trim();

        const lineSpan = span(file, so, eo);
        const typeExpr = parseTypeExprFromText(typeText, lineSpan);

        if (!typeExpr) {
          diag(diagnostics, modulePath, `Unsupported type in data declaration`, {
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
            const e = parseImmExprFromText(modulePath, part, lineSpan, diagnostics);
            if (e) elements.push(e);
          }
          initializer = { kind: 'InitArray', span: lineSpan, elements };
        } else {
          const e = parseImmExprFromText(modulePath, initText, lineSpan, diagnostics);
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

    diag(diagnostics, modulePath, `Unsupported top-level construct in PR3 subset: ${text}`, {
      line: lineNo,
      column: 1,
    });
    i++;
  }

  const moduleSpan = span(file, 0, sourceText.length);
  const moduleFile: ModuleFileNode = {
    kind: 'ModuleFile',
    span: moduleSpan,
    path: modulePath,
    items,
  };

  return moduleFile;
}

/**
 * Parse a ZAX program from a single in-memory source file.
 *
 * Note: this helper parses only the entry module. Import resolution/loading is handled by the compiler.
 */
export function parseProgram(
  entryFile: string,
  sourceText: string,
  diagnostics: Diagnostic[],
): ProgramNode {
  const moduleFile = parseModuleFile(entryFile, sourceText, diagnostics);
  const moduleSpan = moduleFile.span;
  const program: ProgramNode = {
    kind: 'Program',
    span: moduleSpan,
    entryFile,
    files: [moduleFile],
  };

  return program;
}

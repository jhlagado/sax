import type {
  AlignDirectiveNode,
  ImportNode,
  AsmBlockNode,
  AsmInstructionNode,
  AsmItemNode,
  AsmLabelNode,
  AsmOperandNode,
  BinDeclNode,
  ConstDeclNode,
  DataBlockNode,
  DataDeclNode,
  EnumDeclNode,
  EaExprNode,
  EaIndexNode,
  ExternDeclNode,
  ExternFuncNode,
  FuncDeclNode,
  HexDeclNode,
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

function parseTypeExprFromText(
  typeText: string,
  typeSpan: SourceSpan,
  opts: { allowInferredArrayLength: boolean },
): TypeExprNode | undefined {
  let rest = typeText.trim();
  const nameMatch = /^([A-Za-z_][A-Za-z0-9_]*)/.exec(rest);
  if (!nameMatch) return undefined;
  const name = nameMatch[1]!;
  rest = rest.slice(name.length).trimStart();

  let typeExpr: TypeExprNode = { kind: 'TypeName', span: typeSpan, name };

  while (rest.startsWith('[')) {
    const m = /^\[\s*([0-9]+)?\s*\]/.exec(rest);
    if (!m) return undefined;
    const lenText = m[1];
    if (lenText === undefined && !opts.allowInferredArrayLength) return undefined;
    typeExpr =
      lenText === undefined
        ? { kind: 'ArrayType', span: typeSpan, element: typeExpr }
        : {
            kind: 'ArrayType',
            span: typeSpan,
            element: typeExpr,
            length: Number.parseInt(lenText, 10),
          };
    rest = rest.slice(m[0].length).trimStart();
  }

  if (rest.length > 0) return undefined;
  return typeExpr;
}

function diagIfInferredArrayLengthNotAllowed(
  diagnostics: Diagnostic[],
  filePath: string,
  typeText: string,
  where: { line: number; column: number },
): boolean {
  if (!/\[\s*\]/.test(typeText)) return false;
  diag(
    diagnostics,
    filePath,
    `Inferred-length arrays (T[]) are only permitted in data declarations with an initializer.`,
    where,
  );
  return true;
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
    if (ch === "'") {
      i++; // '
      if (i >= s.length) return undefined;

      let value: number | undefined;
      if (s[i] === '\\') {
        i++; // \
        if (i >= s.length) return undefined;
        const esc = s[i]!;
        i++;
        switch (esc) {
          case 'n':
            value = 10;
            break;
          case 'r':
            value = 13;
            break;
          case 't':
            value = 9;
            break;
          case '0':
            value = 0;
            break;
          case '\\':
            value = 92;
            break;
          case "'":
            value = 39;
            break;
          case '"':
            value = 34;
            break;
          case 'x': {
            const hex = s.slice(i, i + 2);
            if (!/^[0-9A-Fa-f]{2}$/.test(hex)) return undefined;
            value = Number.parseInt(hex, 16);
            i += 2;
            break;
          }
          default:
            return undefined;
        }
      } else {
        if (s[i] === "'" || s[i] === '\n' || s[i] === '\r') return undefined;
        const cp = s.codePointAt(i);
        if (cp === undefined) return undefined;
        value = cp;
        i += cp > 0xffff ? 2 : 1;
      }

      if (i >= s.length || s[i] !== "'") return undefined;
      i++; // closing '
      out.push({ kind: 'num', text: String(value) });
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
  emitDiagnostics = true,
): ImmExprNode | undefined {
  const tokenized = tokenizeImm(exprText);
  if (!tokenized) {
    if (emitDiagnostics) {
      diag(diagnostics, filePath, `Invalid imm expression: ${exprText}`, {
        line: exprSpan.start.line,
        column: exprSpan.start.column,
      });
    }
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
    if (emitDiagnostics) {
      diag(diagnostics, filePath, `Invalid imm expression: ${exprText}`, {
        line: exprSpan.start.line,
        column: exprSpan.start.column,
      });
    }
    return undefined;
  }
  return root;
}

function parseBalancedBracketContent(text: string): { inside: string; rest: string } | undefined {
  if (!text.startsWith('[')) return undefined;
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (ch === '[') {
      depth++;
      continue;
    }
    if (ch !== ']') continue;
    depth--;
    if (depth === 0) {
      return {
        inside: text.slice(1, i),
        rest: text.slice(i + 1),
      };
    }
    if (depth < 0) return undefined;
  }
  return undefined;
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

  const imm = parseImmExprFromText(filePath, t, indexSpan, diagnostics, false);
  if (imm) return { kind: 'IndexImm', span: indexSpan, value: imm };

  const ea = parseEaExprFromText(filePath, t, indexSpan, diagnostics);
  if (ea) return { kind: 'IndexEa', span: indexSpan, expr: ea };

  diag(diagnostics, filePath, `Invalid index expression: ${t}`, {
    line: indexSpan.start.line,
    column: indexSpan.start.column,
  });
  return undefined;
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
      const bracket = parseBalancedBracketContent(rest);
      if (!bracket) return undefined;
      const inside = bracket.inside;
      const index = parseEaIndexFromText(filePath, inside, exprSpan, diagnostics);
      if (!index) return undefined;
      expr = { kind: 'EaIndex', span: exprSpan, base: expr, index };
      rest = bracket.rest.trimStart();
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
  emitDiagnostics = true,
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

  const expr = parseImmExprFromText(filePath, t, operandSpan, diagnostics, emitDiagnostics);
  if (expr) {
    return { kind: 'Imm', span: operandSpan, expr };
  }
  if (t.startsWith("'")) {
    // Char literal parsing failures already produce an "Invalid imm expression" diagnostic.
    return undefined;
  }

  if (emitDiagnostics) {
    diag(diagnostics, filePath, `Unsupported operand: ${t}`, {
      line: operandSpan.start.line,
      column: operandSpan.start.column,
    });
  }
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
  const headLower = head.toLowerCase();
  const rest = firstSpace === -1 ? '' : trimmed.slice(firstSpace).trim();

  const operands: AsmOperandNode[] = [];
  if (rest.length > 0) {
    const parseInOutOperand = (operandText: string): AsmOperandNode | undefined => {
      const t = operandText.trim();
      if (t.startsWith('(') && t.endsWith(')')) {
        const inner = t.slice(1, -1).trim();
        if (/^c$/i.test(inner)) return { kind: 'PortC', span: instrSpan };
        const expr = parseImmExprFromText(filePath, inner, instrSpan, diagnostics);
        if (expr) return { kind: 'PortImm8', span: instrSpan, expr };
        // Fall through to the generic operand parser to produce a reasonable diagnostic.
      }
      return parseAsmOperand(filePath, t, instrSpan, diagnostics);
    };

    const parts = rest.split(',').map((p) => p.trim());
    for (const part of parts) {
      const opNode =
        headLower === 'in' || headLower === 'out'
          ? parseInOutOperand(part)
          : parseAsmOperand(filePath, part, instrSpan, diagnostics);
      if (opNode) operands.push(opNode);
    }
  }

  return { kind: 'AsmInstruction', span: instrSpan, head, operands };
}

type AsmControlFrame =
  | { kind: 'If'; elseSeen: boolean; openSpan: SourceSpan }
  | { kind: 'While'; openSpan: SourceSpan }
  | { kind: 'Repeat'; openSpan: SourceSpan }
  | { kind: 'Select'; elseSeen: boolean; armSeen: boolean; openSpan: SourceSpan };

function parseAsmStatement(
  filePath: string,
  text: string,
  stmtSpan: SourceSpan,
  diagnostics: Diagnostic[],
  controlStack: AsmControlFrame[],
): AsmItemNode | undefined {
  const trimmed = text.trim();
  const lower = trimmed.toLowerCase();

  const missingCc = '__missing__';

  if (lower === 'repeat') {
    controlStack.push({ kind: 'Repeat', openSpan: stmtSpan });
    return { kind: 'Repeat', span: stmtSpan };
  }

  if (lower === 'else') {
    const top = controlStack[controlStack.length - 1];
    if (top?.kind === 'Select') {
      if (top.elseSeen) {
        diag(diagnostics, filePath, `"else" duplicated in select`, {
          line: stmtSpan.start.line,
          column: stmtSpan.start.column,
        });
        return undefined;
      }
      top.elseSeen = true;
      top.armSeen = true;
      return { kind: 'SelectElse', span: stmtSpan };
    }
    if (top?.kind !== 'If') {
      diag(diagnostics, filePath, `"else" without matching "if" or "select"`, {
        line: stmtSpan.start.line,
        column: stmtSpan.start.column,
      });
      return undefined;
    }
    if (top.elseSeen) {
      diag(diagnostics, filePath, `"else" duplicated in if`, {
        line: stmtSpan.start.line,
        column: stmtSpan.start.column,
      });
      return undefined;
    }
    top.elseSeen = true;
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
    if (top.kind === 'Repeat') {
      diag(diagnostics, filePath, `"repeat" blocks must close with "until <cc>"`, {
        line: stmtSpan.start.line,
        column: stmtSpan.start.column,
      });
      return undefined;
    }
    if (top.kind === 'Select' && !top.armSeen) {
      diag(diagnostics, filePath, `"select" must contain at least one arm ("case" or "else")`, {
        line: stmtSpan.start.line,
        column: stmtSpan.start.column,
      });
      return undefined;
    }
    return { kind: 'End', span: stmtSpan };
  }

  const ifMatch = /^if\s+([A-Za-z][A-Za-z0-9]*)$/i.exec(trimmed);
  if (ifMatch) {
    const cc = ifMatch[1]!;
    controlStack.push({ kind: 'If', elseSeen: false, openSpan: stmtSpan });
    return { kind: 'If', span: stmtSpan, cc };
  }
  if (lower.startsWith('if ')) {
    diag(diagnostics, filePath, `"if" expects a condition code`, {
      line: stmtSpan.start.line,
      column: stmtSpan.start.column,
    });
    return undefined;
  }
  if (lower === 'if') {
    diag(diagnostics, filePath, `"if" expects a condition code`, {
      line: stmtSpan.start.line,
      column: stmtSpan.start.column,
    });
    controlStack.push({ kind: 'If', elseSeen: false, openSpan: stmtSpan });
    return { kind: 'If', span: stmtSpan, cc: missingCc };
  }

  const whileMatch = /^while\s+([A-Za-z][A-Za-z0-9]*)$/i.exec(trimmed);
  if (whileMatch) {
    const cc = whileMatch[1]!;
    controlStack.push({ kind: 'While', openSpan: stmtSpan });
    return { kind: 'While', span: stmtSpan, cc };
  }
  if (lower.startsWith('while ')) {
    diag(diagnostics, filePath, `"while" expects a condition code`, {
      line: stmtSpan.start.line,
      column: stmtSpan.start.column,
    });
    return undefined;
  }
  if (lower === 'while') {
    diag(diagnostics, filePath, `"while" expects a condition code`, {
      line: stmtSpan.start.line,
      column: stmtSpan.start.column,
    });
    controlStack.push({ kind: 'While', openSpan: stmtSpan });
    return { kind: 'While', span: stmtSpan, cc: missingCc };
  }

  if (lower === 'until') {
    const top = controlStack[controlStack.length - 1];
    if (top?.kind !== 'Repeat') {
      diag(diagnostics, filePath, `"until" without matching "repeat"`, {
        line: stmtSpan.start.line,
        column: stmtSpan.start.column,
      });
      return undefined;
    }
    diag(diagnostics, filePath, `"until" expects a condition code`, {
      line: stmtSpan.start.line,
      column: stmtSpan.start.column,
    });
    controlStack.pop();
    return { kind: 'Until', span: stmtSpan, cc: missingCc };
  }
  const untilMatch = /^until\s+([A-Za-z][A-Za-z0-9]*)$/i.exec(trimmed);
  if (untilMatch) {
    const cc = untilMatch[1]!;
    const top = controlStack[controlStack.length - 1];
    if (top?.kind !== 'Repeat') {
      diag(diagnostics, filePath, `"until" without matching "repeat"`, {
        line: stmtSpan.start.line,
        column: stmtSpan.start.column,
      });
      return undefined;
    }
    controlStack.pop();
    return { kind: 'Until', span: stmtSpan, cc };
  }
  if (lower.startsWith('until ')) {
    const top = controlStack[controlStack.length - 1];
    if (top?.kind !== 'Repeat') {
      diag(diagnostics, filePath, `"until" without matching "repeat"`, {
        line: stmtSpan.start.line,
        column: stmtSpan.start.column,
      });
      return undefined;
    }
    diag(diagnostics, filePath, `"until" expects a condition code`, {
      line: stmtSpan.start.line,
      column: stmtSpan.start.column,
    });
    controlStack.pop();
    return { kind: 'Until', span: stmtSpan, cc: missingCc };
  }

  if (lower === 'select') {
    diag(diagnostics, filePath, `"select" expects a selector`, {
      line: stmtSpan.start.line,
      column: stmtSpan.start.column,
    });
    controlStack.push({ kind: 'Select', elseSeen: false, armSeen: false, openSpan: stmtSpan });
    return {
      kind: 'Select',
      span: stmtSpan,
      selector: { kind: 'Imm', span: stmtSpan, expr: immLiteral(filePath, stmtSpan, 0) },
    };
  }
  const selectMatch = /^select\s+(.+)$/i.exec(trimmed);
  if (selectMatch) {
    const selectorText = selectMatch[1]!.trim();
    const selector = parseAsmOperand(filePath, selectorText, stmtSpan, diagnostics, false);
    if (!selector) {
      diag(diagnostics, filePath, `Invalid select selector`, {
        line: stmtSpan.start.line,
        column: stmtSpan.start.column,
      });
      controlStack.push({ kind: 'Select', elseSeen: false, armSeen: false, openSpan: stmtSpan });
      return {
        kind: 'Select',
        span: stmtSpan,
        selector: { kind: 'Imm', span: stmtSpan, expr: immLiteral(filePath, stmtSpan, 0) },
      };
    }
    controlStack.push({ kind: 'Select', elseSeen: false, armSeen: false, openSpan: stmtSpan });
    return { kind: 'Select', span: stmtSpan, selector };
  }

  const caseMatch = /^case\s+(.+)$/i.exec(trimmed);
  if (caseMatch) {
    const top = controlStack[controlStack.length - 1];
    if (top?.kind !== 'Select') {
      diag(diagnostics, filePath, `"case" without matching "select"`, {
        line: stmtSpan.start.line,
        column: stmtSpan.start.column,
      });
      return undefined;
    }
    if (top.elseSeen) {
      diag(diagnostics, filePath, `"case" after "else" in select`, {
        line: stmtSpan.start.line,
        column: stmtSpan.start.column,
      });
      return undefined;
    }
    top.armSeen = true;
    const exprText = caseMatch[1]!.trim();
    const value = parseImmExprFromText(filePath, exprText, stmtSpan, diagnostics, false);
    if (!value) {
      diag(diagnostics, filePath, `Invalid case value`, {
        line: stmtSpan.start.line,
        column: stmtSpan.start.column,
      });
      return undefined;
    }
    return { kind: 'Case', span: stmtSpan, value };
  }
  if (lower === 'case') {
    const top = controlStack[controlStack.length - 1];
    if (top?.kind !== 'Select') {
      diag(diagnostics, filePath, `"case" without matching "select"`, {
        line: stmtSpan.start.line,
        column: stmtSpan.start.column,
      });
      return undefined;
    }
    if (top.elseSeen) {
      diag(diagnostics, filePath, `"case" after "else" in select`, {
        line: stmtSpan.start.line,
        column: stmtSpan.start.column,
      });
      return undefined;
    }
    top.armSeen = true;
    diag(diagnostics, filePath, `"case" expects a value`, {
      line: stmtSpan.start.line,
      column: stmtSpan.start.column,
    });
    return undefined;
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
    const typeExpr = parseTypeExprFromText(typeText, paramsSpan, {
      allowInferredArrayLength: false,
    });
    if (!typeExpr) {
      if (
        diagIfInferredArrayLengthNotAllowed(diagnostics, filePath, typeText, {
          line: paramsSpan.start.line,
          column: paramsSpan.start.column,
        })
      )
        return undefined;
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

    // In v0.1, `export` is accepted only on `const`, `func`, and `op` declarations.
    // It has no semantic effect today, but we still reject it on all other constructs
    // to keep the surface area explicit and future-proof.
    if (exportPrefix.length > 0) {
      const allowed =
        rest.startsWith('const ') || rest.startsWith('func ') || rest.startsWith('op ');
      if (!allowed) {
        diag(diagnostics, modulePath, `export is only permitted on const/func/op declarations`, {
          line: lineNo,
          column: 1,
        });
      }
    }

    if (rest.startsWith('import ')) {
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
      const afterType = rest.slice('type '.length).trim();
      const parts = afterType.split(/\s+/, 2);
      const name = parts[0] ?? '';
      const tail = afterType.slice(name.length).trimStart();
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
        diag(diagnostics, modulePath, `Invalid type name`, { line: lineNo, column: 1 });
        i++;
        continue;
      }

      // Alias form: `type Name <typeExpr>`
      if (tail.length > 0) {
        const stmtSpan = span(file, lineStartOffset, lineEndOffset);
        const typeExpr = parseTypeExprFromText(tail, stmtSpan, { allowInferredArrayLength: false });
        if (!typeExpr) {
          if (
            diagIfInferredArrayLengthNotAllowed(diagnostics, modulePath, tail, {
              line: lineNo,
              column: 1,
            })
          ) {
            i++;
            continue;
          }
          diag(diagnostics, modulePath, `Invalid type alias`, { line: lineNo, column: 1 });
          i++;
          continue;
        }
        items.push({ kind: 'TypeDecl', span: stmtSpan, name, typeExpr });
        i++;
        continue;
      }

      // Record form:
      // type Name
      //   field: type
      // end
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
        const typeExpr = parseTypeExprFromText(typeText, fieldSpan, {
          allowInferredArrayLength: false,
        });
        if (!typeExpr) {
          if (
            diagIfInferredArrayLengthNotAllowed(diagnostics, modulePath, typeText, {
              line: i + 1,
              column: 1,
            })
          ) {
            i++;
            continue;
          }
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

      if (fields.length === 0) {
        diag(diagnostics, modulePath, `Type "${name}" must contain at least one field`, {
          line: lineNo,
          column: 1,
        });
      }

      const typeEnd = terminated ? typeEndOffset : file.text.length;
      const typeSpan = span(file, typeStart, typeEnd);
      items.push({
        kind: 'TypeDecl',
        span: typeSpan,
        name,
        typeExpr: { kind: 'RecordType', span: typeSpan, fields },
      });
      continue;
    }

    if (rest.startsWith('union ')) {
      const name = rest.slice('union '.length).trim();
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
        diag(diagnostics, modulePath, `Invalid union name`, { line: lineNo, column: 1 });
        i++;
        continue;
      }

      const unionStart = lineStartOffset;
      const fields: RecordFieldNode[] = [];
      let terminated = false;
      let unionEndOffset = file.text.length;
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
          unionEndOffset = eo;
          i++;
          break;
        }

        const m = /^([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(.+)$/.exec(t);
        if (!m) {
          diag(diagnostics, modulePath, `Invalid union field declaration`, {
            line: i + 1,
            column: 1,
          });
          i++;
          continue;
        }

        const fieldName = m[1]!;
        const typeText = m[2]!.trim();
        const fieldSpan = span(file, so, eo);
        const typeExpr = parseTypeExprFromText(typeText, fieldSpan, {
          allowInferredArrayLength: false,
        });
        if (!typeExpr) {
          if (
            diagIfInferredArrayLengthNotAllowed(diagnostics, modulePath, typeText, {
              line: i + 1,
              column: 1,
            })
          ) {
            i++;
            continue;
          }
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
        diag(diagnostics, modulePath, `Unterminated union "${name}": missing "end"`, {
          line: lineNo,
          column: 1,
        });
      }

      if (fields.length === 0) {
        diag(diagnostics, modulePath, `Union "${name}" must contain at least one field`, {
          line: lineNo,
          column: 1,
        });
      }

      const unionEnd = terminated ? unionEndOffset : file.text.length;
      const unionSpan = span(file, unionStart, unionEnd);
      items.push({ kind: 'UnionDecl', span: unionSpan, name, fields });
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
        const typeExpr = parseTypeExprFromText(typeText, declSpan, {
          allowInferredArrayLength: false,
        });
        if (!typeExpr) {
          if (
            diagIfInferredArrayLengthNotAllowed(diagnostics, modulePath, typeText, {
              line: i + 1,
              column: 1,
            })
          )
            break;
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
      const returnType = parseTypeExprFromText(retTypeText, headerSpan, {
        allowInferredArrayLength: false,
      });
      if (!returnType) {
        if (
          diagIfInferredArrayLengthNotAllowed(diagnostics, modulePath, retTypeText, {
            line: lineNo,
            column: 1,
          })
        ) {
          i++;
          continue;
        }
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
            const typeExpr = parseTypeExprFromText(typeText, declSpan, {
              allowInferredArrayLength: false,
            });
            if (!typeExpr) {
              if (
                diagIfInferredArrayLengthNotAllowed(diagnostics, modulePath, typeText, {
                  line: i + 1,
                  column: 1,
                })
              ) {
                i++;
                continue;
              }
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
        for (const frame of asmControlStack) {
          const span = frame.openSpan;
          const msg =
            frame.kind === 'Repeat'
              ? `"repeat" without matching "until <cc>"`
              : `"${frame.kind.toLowerCase()}" without matching "end"`;
          diag(diagnostics, modulePath, msg, { line: span.start.line, column: span.start.column });
        }
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
        for (const frame of controlStack) {
          const span = frame.openSpan;
          const msg =
            frame.kind === 'Repeat'
              ? `"repeat" without matching "until <cc>"`
              : `"${frame.kind.toLowerCase()}" without matching "end"`;
          diag(diagnostics, modulePath, msg, { line: span.start.line, column: span.start.column });
        }
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
      const returnType = parseTypeExprFromText(retTypeText, stmtSpan, {
        allowInferredArrayLength: false,
      });
      if (!returnType) {
        if (
          diagIfInferredArrayLengthNotAllowed(diagnostics, modulePath, retTypeText, {
            line: lineNo,
            column: 1,
          })
        ) {
          i++;
          continue;
        }
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

    if (rest.startsWith('bin ')) {
      const varTarget = /^bin\s+[A-Za-z_][A-Za-z0-9_]*\s+in\s+var\s+from\s+"[^"]+"$/i.test(rest);
      if (varTarget) {
        diag(diagnostics, modulePath, `bin declarations cannot target section "var"`, {
          line: lineNo,
          column: 1,
        });
        i++;
        continue;
      }
      const m = /^bin\s+([A-Za-z_][A-Za-z0-9_]*)\s+in\s+(code|data)\s+from\s+"([^"]+)"$/i.exec(
        rest,
      );
      if (!m) {
        diag(diagnostics, modulePath, `Invalid bin declaration`, { line: lineNo, column: 1 });
        i++;
        continue;
      }
      const node: BinDeclNode = {
        kind: 'BinDecl',
        span: span(file, lineStartOffset, lineEndOffset),
        name: m[1]!,
        section: m[2]!.toLowerCase() as BinDeclNode['section'],
        fromPath: m[3]!,
      };
      items.push(node);
      i++;
      continue;
    }

    if (rest.startsWith('hex ')) {
      const m = /^hex\s+([A-Za-z_][A-Za-z0-9_]*)\s+from\s+"([^"]+)"$/i.exec(rest);
      if (!m) {
        diag(diagnostics, modulePath, `Invalid hex declaration`, { line: lineNo, column: 1 });
        i++;
        continue;
      }
      const node: HexDeclNode = {
        kind: 'HexDecl',
        span: span(file, lineStartOffset, lineEndOffset),
        name: m[1]!,
        fromPath: m[2]!,
      };
      items.push(node);
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
        const typeExpr = parseTypeExprFromText(typeText, lineSpan, {
          allowInferredArrayLength: true,
        });

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

    diag(diagnostics, modulePath, `Unsupported top-level construct: ${text}`, {
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

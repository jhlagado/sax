import type {
  AsmBlockNode,
  AsmInstructionNode,
  AsmItemNode,
  AsmLabelNode,
  AsmOperandNode,
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

  diag(diagnostics, filePath, `Unsupported operand in PR1 subset: ${t}`, {
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
 * PR1 implementation note:
 * - Only a minimal subset is supported (single file, `func name(): void`, and an `asm` block).
 * - Operands are limited to registers and immediate numeric literals.
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

    diag(diagnostics, entryFile, `Unsupported top-level construct in PR1 subset: ${text}`, {
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

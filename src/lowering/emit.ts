import type { Diagnostic } from '../diagnostics/types.js';
import { DiagnosticIds } from '../diagnostics/types.js';
import type { EmittedByteMap, SymbolEntry } from '../formats/types.js';
import type { DataBlockNode, EnumDeclNode, ProgramNode, VarBlockNode } from '../frontend/ast.js';
import type { CompileEnv } from '../semantics/env.js';
import { evalImmExpr } from '../semantics/env.js';
import { sizeOfTypeExpr } from '../semantics/layout.js';
import { encodeInstruction } from '../z80/encode.js';

function diag(diagnostics: Diagnostic[], file: string, message: string): void {
  diagnostics.push({ id: DiagnosticIds.Unknown, severity: 'error', message, file });
}

/**
 * Emit machine-code bytes for a parsed program into an address->byte map.
 *
 * PR2 implementation note:
 * - Uses a single linear PC starting at 0 (no sections/imports yet).
 * - Collects label symbols and encodes only the PR1 instruction subset.
 * - Appends `data` blocks after `code` (aligned to 2), and adds const/data symbols.
 * - Appends errors to `diagnostics` and continues best-effort.
 */
export function emitProgram(
  program: ProgramNode,
  env: CompileEnv,
  diagnostics: Diagnostic[],
): { map: EmittedByteMap; symbols: SymbolEntry[] } {
  const bytes = new Map<number, number>();
  const symbols: SymbolEntry[] = [];

  if (program.files.length !== 1) {
    diag(
      diagnostics,
      program.entryFile,
      `PR1 supports single-file programs only (got ${program.files.length}).`,
    );
    return { map: { bytes }, symbols };
  }

  let pc = 0;
  const module = program.files[0];
  if (!module) {
    diag(diagnostics, program.entryFile, 'No module files to compile.');
    return { map: { bytes }, symbols };
  }

  const taken = new Set<string>();

  for (const item of module.items) {
    if (item.kind === 'ConstDecl') {
      const v = env.consts.get(item.name);
      if (v !== undefined) {
        symbols.push({
          kind: 'constant',
          name: item.name,
          address: v,
          file: item.span.file,
          line: item.span.start.line,
          scope: 'global',
        });
        taken.add(item.name);
      }
      continue;
    }
    if (item.kind !== 'FuncDecl') continue;
    for (const asmItem of item.asm.items) {
      if (asmItem.kind === 'AsmLabel') {
        symbols.push({
          kind: 'label',
          name: asmItem.name,
          address: pc,
          file: asmItem.span.file,
          line: asmItem.span.start.line,
          scope: 'global',
        });
        taken.add(asmItem.name);
        continue;
      }
      if (asmItem.kind !== 'AsmInstruction') continue;

      const encoded = encodeInstruction(asmItem, env, diagnostics);
      if (!encoded) continue;
      for (const b of encoded) {
        bytes.set(pc, b);
        pc++;
      }
    }
  }

  const enumDecls = module.items.filter((i): i is EnumDeclNode => i.kind === 'EnumDecl');
  for (const e of enumDecls) {
    for (let idx = 0; idx < e.members.length; idx++) {
      const name = e.members[idx]!;
      if (env.enums.get(name) !== idx) continue;
      if (taken.has(name)) {
        diag(diagnostics, e.span.file, `Duplicate symbol name "${name}".`);
        continue;
      }
      taken.add(name);
      symbols.push({
        kind: 'constant',
        name,
        address: idx,
        file: e.span.file,
        line: e.span.start.line,
        scope: 'global',
      });
    }
  }

  const align2 = (n: number) => (n + 1) & ~1;

  const dataBlocks = module.items.filter((i): i is DataBlockNode => i.kind === 'DataBlock');
  let dataPc = pc;
  if (dataBlocks.length > 0) {
    // Pack data blocks after code (aligned to 2) per spec default.
    dataPc = align2(pc);

    for (const item of dataBlocks) {
      for (const decl of item.decls) {
        const okToDeclareSymbol = !taken.has(decl.name);
        if (taken.has(decl.name)) {
          diag(diagnostics, decl.span.file, `Duplicate symbol name "${decl.name}".`);
        } else {
          taken.add(decl.name);
        }
        if (okToDeclareSymbol) {
          symbols.push({
            kind: 'data',
            name: decl.name,
            address: dataPc,
            file: decl.span.file,
            line: decl.span.start.line,
            scope: 'global',
          });
        }

        const type = decl.typeExpr;
        const init = decl.initializer;

        const emitByte = (b: number) => {
          bytes.set(dataPc, b & 0xff);
          dataPc++;
        };
        const emitWord = (w: number) => {
          emitByte(w & 0xff);
          emitByte((w >> 8) & 0xff);
        };

        const elementType =
          type.kind === 'ArrayType'
            ? type.element.kind === 'TypeName'
              ? type.element.name
              : undefined
            : type.kind === 'TypeName'
              ? type.name
              : undefined;
        const elementSize =
          elementType === 'word' || elementType === 'addr'
            ? 2
            : elementType === 'byte'
              ? 1
              : undefined;
        if (!elementType || !elementSize) {
          diag(
            diagnostics,
            decl.span.file,
            `Unsupported data type in PR2 subset for "${decl.name}".`,
          );
          continue;
        }

        const length = type.kind === 'ArrayType' ? type.length : 1;

        if (init.kind === 'InitString') {
          if (elementSize !== 1) {
            diag(
              diagnostics,
              decl.span.file,
              `String initializer requires byte element type for "${decl.name}".`,
            );
            continue;
          }
          if (length !== undefined && init.value.length !== length) {
            diag(diagnostics, decl.span.file, `String length mismatch for "${decl.name}".`);
            continue;
          }
          for (let idx = 0; idx < init.value.length; idx++) {
            emitByte(init.value.charCodeAt(idx));
          }
          continue;
        }

        const values: number[] = [];
        for (const e of init.elements) {
          const v = evalImmExpr(e, env, diagnostics);
          if (v === undefined) {
            diag(
              diagnostics,
              decl.span.file,
              `Failed to evaluate data initializer for "${decl.name}".`,
            );
            break;
          }
          values.push(v);
        }

        if (length !== undefined && values.length !== length) {
          diag(diagnostics, decl.span.file, `Initializer length mismatch for "${decl.name}".`);
          continue;
        }

        for (const v of values) {
          if (elementSize === 1) emitByte(v);
          else emitWord(v);
        }
      }
    }
  }

  const writtenEnd = Math.max(pc, dataPc);

  const varBlocks = module.items.filter(
    (i): i is VarBlockNode => i.kind === 'VarBlock' && i.scope === 'module',
  );
  if (varBlocks.length > 0) {
    let varPc = align2(writtenEnd);
    for (const block of varBlocks) {
      for (const decl of block.decls) {
        const size = sizeOfTypeExpr(decl.typeExpr, env, diagnostics);
        if (size === undefined) continue;
        if (env.consts.has(decl.name)) {
          diag(diagnostics, decl.span.file, `Var name "${decl.name}" collides with a const.`);
          varPc += size;
          continue;
        }
        if (env.enums.has(decl.name)) {
          diag(
            diagnostics,
            decl.span.file,
            `Var name "${decl.name}" collides with an enum member.`,
          );
          varPc += size;
          continue;
        }
        if (env.types.has(decl.name)) {
          diag(diagnostics, decl.span.file, `Var name "${decl.name}" collides with a type name.`);
          varPc += size;
          continue;
        }
        if (taken.has(decl.name)) {
          diag(
            diagnostics,
            decl.span.file,
            `Duplicate symbol name "${decl.name}" for var declaration.`,
          );
          varPc += size;
          continue;
        }
        taken.add(decl.name);
        symbols.push({
          kind: 'var',
          name: decl.name,
          address: varPc,
          file: decl.span.file,
          line: decl.span.start.line,
          scope: 'global',
          size,
        });
        varPc += size;
      }
    }
  }

  return { map: { bytes, writtenRange: { start: 0, end: writtenEnd } }, symbols };
}

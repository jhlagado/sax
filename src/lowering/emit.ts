import type { Diagnostic } from '../diagnostics/types.js';
import { DiagnosticIds } from '../diagnostics/types.js';
import type { EmittedByteMap, SymbolEntry } from '../formats/types.js';
import type {
  AlignDirectiveNode,
  DataBlockNode,
  EnumDeclNode,
  ProgramNode,
  SectionDirectiveNode,
  VarBlockNode,
} from '../frontend/ast.js';
import type { CompileEnv } from '../semantics/env.js';
import { evalImmExpr } from '../semantics/env.js';
import { sizeOfTypeExpr } from '../semantics/layout.js';
import { encodeInstruction } from '../z80/encode.js';

function diag(diagnostics: Diagnostic[], file: string, message: string): void {
  diagnostics.push({ id: DiagnosticIds.EmitError, severity: 'error', message, file });
}

/**
 * Emit machine-code bytes for a parsed program into an address->byte map.
 *
 * Implementation notes:
 * - Uses 3 independent section counters: `code`, `data`, `var`.
 * - `section` / `align` directives affect only the selected section counter.
 * - By default, `data` starts after `code` (aligned to 2), and `var` starts after `data` (aligned to 2),
 *   matching the earlier PR2 behavior.
 * - Detects overlapping byte emissions across all sections.
 */
export function emitProgram(
  program: ProgramNode,
  env: CompileEnv,
  diagnostics: Diagnostic[],
): { map: EmittedByteMap; symbols: SymbolEntry[] } {
  type SectionKind = 'code' | 'data' | 'var';
  type PendingSymbol = {
    kind: 'label' | 'data' | 'var';
    name: string;
    section: SectionKind;
    offset: number;
    file?: string;
    line?: number;
    scope?: 'global' | 'local';
    size?: number;
  };

  const bytes = new Map<number, number>();
  const codeBytes = new Map<number, number>();
  const dataBytes = new Map<number, number>();
  const symbols: SymbolEntry[] = [];
  const pending: PendingSymbol[] = [];
  const taken = new Set<string>();

  if (program.files.length !== 1) {
    diag(
      diagnostics,
      program.entryFile,
      `PR1 supports single-file programs only (got ${program.files.length}).`,
    );
    return { map: { bytes }, symbols };
  }

  const module = program.files[0];
  if (!module) {
    diag(diagnostics, program.entryFile, 'No module files to compile.');
    return { map: { bytes }, symbols };
  }

  const alignTo = (n: number, a: number) => (a <= 0 ? n : Math.ceil(n / a) * a);

  let activeSection: SectionKind = 'code';
  let codeOffset = 0;
  let dataOffset = 0;
  let varOffset = 0;

  const baseExprs: Partial<Record<SectionKind, SectionDirectiveNode['at']>> = {};

  const setBaseExpr = (kind: SectionKind, at: SectionDirectiveNode['at'], file: string) => {
    if (baseExprs[kind]) {
      diag(diagnostics, file, `Section "${kind}" base address may be set at most once.`);
      return;
    }
    baseExprs[kind] = at;
  };

  const advanceAlign = (a: number) => {
    switch (activeSection) {
      case 'code':
        codeOffset = alignTo(codeOffset, a);
        return;
      case 'data':
        dataOffset = alignTo(dataOffset, a);
        return;
      case 'var':
        varOffset = alignTo(varOffset, a);
        return;
    }
  };

  for (const item of module.items) {
    if (item.kind === 'ConstDecl') {
      const v = env.consts.get(item.name);
      if (v !== undefined) {
        if (taken.has(item.name)) {
          diag(diagnostics, item.span.file, `Duplicate symbol name "${item.name}".`);
          continue;
        }
        taken.add(item.name);
        symbols.push({
          kind: 'constant',
          name: item.name,
          value: v,
          address: v,
          file: item.span.file,
          line: item.span.start.line,
          scope: 'global',
        });
      }
      continue;
    }

    if (item.kind === 'EnumDecl') {
      const e = item as EnumDeclNode;
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
          value: idx,
          address: idx,
          file: e.span.file,
          line: e.span.start.line,
          scope: 'global',
        });
      }
      continue;
    }

    if (item.kind === 'Section') {
      const s = item as SectionDirectiveNode;
      activeSection = s.section;
      if (s.at) setBaseExpr(s.section, s.at, s.span.file);
      continue;
    }

    if (item.kind === 'Align') {
      const a = item as AlignDirectiveNode;
      const v = evalImmExpr(a.value, env, diagnostics);
      if (v === undefined) {
        diag(diagnostics, a.span.file, `Failed to evaluate align value.`);
        continue;
      }
      if (v <= 0) {
        diag(diagnostics, a.span.file, `align value must be > 0.`);
        continue;
      }
      advanceAlign(v);
      continue;
    }

    if (item.kind === 'FuncDecl') {
      for (const asmItem of item.asm.items) {
        if (asmItem.kind === 'AsmLabel') {
          if (taken.has(asmItem.name)) {
            diag(diagnostics, asmItem.span.file, `Duplicate symbol name "${asmItem.name}".`);
            continue;
          }
          taken.add(asmItem.name);
          pending.push({
            kind: 'label',
            name: asmItem.name,
            section: 'code',
            offset: codeOffset,
            file: asmItem.span.file,
            line: asmItem.span.start.line,
            scope: 'global',
          });
          continue;
        }
        if (asmItem.kind !== 'AsmInstruction') continue;

        const encoded = encodeInstruction(asmItem, env, diagnostics);
        if (!encoded) continue;
        for (const b of encoded) {
          codeBytes.set(codeOffset, b);
          codeOffset++;
        }
      }
      continue;
    }

    if (item.kind === 'DataBlock') {
      const dataBlock = item as DataBlockNode;
      for (const decl of dataBlock.decls) {
        const okToDeclareSymbol = !taken.has(decl.name);
        if (!okToDeclareSymbol) {
          diag(diagnostics, decl.span.file, `Duplicate symbol name "${decl.name}".`);
        } else {
          taken.add(decl.name);
          pending.push({
            kind: 'data',
            name: decl.name,
            section: 'data',
            offset: dataOffset,
            file: decl.span.file,
            line: decl.span.start.line,
            scope: 'global',
          });
        }

        const type = decl.typeExpr;
        const init = decl.initializer;

        const emitByte = (b: number) => {
          dataBytes.set(dataOffset, b & 0xff);
          dataOffset++;
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
      continue;
    }

    if (item.kind === 'VarBlock' && item.scope === 'module') {
      const varBlock = item as VarBlockNode;
      for (const decl of varBlock.decls) {
        const size = sizeOfTypeExpr(decl.typeExpr, env, diagnostics);
        if (size === undefined) continue;
        if (env.consts.has(decl.name)) {
          diag(diagnostics, decl.span.file, `Var name "${decl.name}" collides with a const.`);
          varOffset += size;
          continue;
        }
        if (env.enums.has(decl.name)) {
          diag(
            diagnostics,
            decl.span.file,
            `Var name "${decl.name}" collides with an enum member.`,
          );
          varOffset += size;
          continue;
        }
        if (env.types.has(decl.name)) {
          diag(diagnostics, decl.span.file, `Var name "${decl.name}" collides with a type name.`);
          varOffset += size;
          continue;
        }
        if (taken.has(decl.name)) {
          diag(
            diagnostics,
            decl.span.file,
            `Duplicate symbol name "${decl.name}" for var declaration.`,
          );
          varOffset += size;
          continue;
        }
        taken.add(decl.name);
        pending.push({
          kind: 'var',
          name: decl.name,
          section: 'var',
          offset: varOffset,
          file: decl.span.file,
          line: decl.span.start.line,
          scope: 'global',
          size,
        });
        varOffset += size;
      }
    }
  }

  const evalBase = (kind: SectionKind): number | undefined => {
    const at = baseExprs[kind];
    if (!at) return undefined;
    const v = evalImmExpr(at, env, diagnostics);
    if (v === undefined) {
      diag(diagnostics, at.span.file, `Failed to evaluate section "${kind}" base address.`);
      return undefined;
    }
    if (v < 0 || v > 0xffff) {
      diag(diagnostics, at.span.file, `Section "${kind}" base address out of range (0..65535).`);
      return undefined;
    }
    return v;
  };

  const explicitCodeBase = evalBase('code');
  const explicitDataBase = evalBase('data');
  const explicitVarBase = evalBase('var');

  const codeOk = explicitCodeBase !== undefined || !baseExprs.code;
  const codeBase = explicitCodeBase ?? 0;

  const dataBase =
    explicitDataBase ??
    (codeOk
      ? alignTo(codeBase + codeOffset, 2)
      : (diag(
          diagnostics,
          module.span.file,
          `Cannot compute default data base address because code base address is invalid.`,
        ),
        0));
  const dataOk = explicitDataBase !== undefined || (baseExprs.data === undefined && codeOk);

  const varBase =
    explicitVarBase ??
    (dataOk
      ? alignTo(dataBase + dataOffset, 2)
      : (diag(
          diagnostics,
          module.span.file,
          `Cannot compute default var base address because data base address is invalid.`,
        ),
        0));
  const varOk = explicitVarBase !== undefined || (baseExprs.var === undefined && dataOk);

  const writeSection = (base: number, section: Map<number, number>, file: string) => {
    for (const [off, b] of section) {
      const addr = base + off;
      if (addr < 0 || addr > 0xffff) {
        diag(diagnostics, file, `Emitted byte address out of range: ${addr}.`);
        continue;
      }
      if (bytes.has(addr)) {
        diag(diagnostics, file, `Byte overlap at address ${addr}.`);
        continue;
      }
      bytes.set(addr, b);
    }
  };

  if (codeOk) writeSection(codeBase, codeBytes, module.span.file);
  if (dataOk) writeSection(dataBase, dataBytes, module.span.file);

  for (const ps of pending) {
    const base = ps.section === 'code' ? codeBase : ps.section === 'data' ? dataBase : varBase;
    const ok = ps.section === 'code' ? codeOk : ps.section === 'data' ? dataOk : varOk;
    if (!ok) continue;
    const sym: SymbolEntry = {
      kind: ps.kind,
      name: ps.name,
      address: base + ps.offset,
      ...(ps.file !== undefined ? { file: ps.file } : {}),
      ...(ps.line !== undefined ? { line: ps.line } : {}),
      ...(ps.scope !== undefined ? { scope: ps.scope } : {}),
      ...(ps.size !== undefined ? { size: ps.size } : {}),
    };
    symbols.push(sym);
  }

  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const addr of bytes.keys()) {
    min = Math.min(min, addr);
    max = Math.max(max, addr);
  }
  const writtenRange =
    Number.isFinite(min) && Number.isFinite(max)
      ? { start: min, end: max + 1 }
      : { start: 0, end: 0 };

  return { map: { bytes, writtenRange }, symbols };
}

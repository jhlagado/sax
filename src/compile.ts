import { readFile } from 'node:fs/promises';

import type { Diagnostic } from './diagnostics/types.js';
import { DiagnosticIds } from './diagnostics/types.js';
import type { CompileFn, CompilerOptions, CompileResult, PipelineDeps } from './pipeline.js';

import type { ProgramNode } from './frontend/ast.js';
import { parseProgram } from './frontend/parser.js';
import { emitProgram } from './lowering/emit.js';
import type { Artifact } from './formats/types.js';

function hasErrors(diagnostics: Diagnostic[]): boolean {
  return diagnostics.some((d) => d.severity === 'error');
}

function withDefaults(
  options: CompilerOptions,
): Required<Pick<CompilerOptions, 'emitBin' | 'emitHex' | 'emitD8m'>> {
  const anyEmitSpecified = [options.emitBin, options.emitHex, options.emitD8m].some(
    (v) => v !== undefined,
  );
  if (!anyEmitSpecified) {
    return { emitBin: true, emitHex: true, emitD8m: true };
  }
  return {
    emitBin: options.emitBin ?? false,
    emitHex: options.emitHex ?? false,
    emitD8m: options.emitD8m ?? false,
  };
}

/**
 * Compile a ZAX program starting from an entry file.
 *
 * PR1 implementation note:
 * - Supports a minimal subset (single file, `func` + `asm`, a tiny instruction set).
 * - Produces artifacts in-memory via `deps.formats` (no filesystem writes yet).
 * - Defaults to emitting BIN + HEX + D8M unless an emit flag is explicitly provided.
 */
export const compile: CompileFn = async (
  entryFile: string,
  options: CompilerOptions,
  deps: PipelineDeps,
): Promise<CompileResult> => {
  const diagnostics: Diagnostic[] = [];

  let sourceText: string;
  try {
    sourceText = await readFile(entryFile, 'utf8');
  } catch (err) {
    diagnostics.push({
      id: DiagnosticIds.Unknown,
      severity: 'error',
      message: `Failed to read entry file: ${String(err)}`,
      file: entryFile,
    });
    return { diagnostics, artifacts: [] };
  }

  let program: ProgramNode;
  try {
    program = parseProgram(entryFile, sourceText, diagnostics);
  } catch (err) {
    diagnostics.push({
      id: DiagnosticIds.Unknown,
      severity: 'error',
      message: `Internal error during parse: ${String(err)}`,
      file: entryFile,
    });
    return { diagnostics, artifacts: [] };
  }

  if (hasErrors(diagnostics)) {
    return { diagnostics, artifacts: [] };
  }

  const { map, symbols } = emitProgram(program, diagnostics);
  if (hasErrors(diagnostics)) {
    return { diagnostics, artifacts: [] };
  }

  const emit = withDefaults(options);
  const artifacts: Artifact[] = [];

  if (emit.emitBin) {
    artifacts.push(deps.formats.writeBin(map, symbols));
  }
  if (emit.emitHex) {
    artifacts.push(deps.formats.writeHex(map, symbols));
  }
  if (emit.emitD8m) {
    artifacts.push(deps.formats.writeD8m(map, symbols));
  }

  return { diagnostics, artifacts };
};

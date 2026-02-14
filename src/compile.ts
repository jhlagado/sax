import { readFile } from 'node:fs/promises';
import { basename, dirname, extname, resolve } from 'node:path';

import type { Diagnostic } from './diagnostics/types.js';
import { DiagnosticIds } from './diagnostics/types.js';
import type { CompileFn, CompilerOptions, CompileResult, PipelineDeps } from './pipeline.js';

import type { ProgramNode } from './frontend/ast.js';
import type { ImportNode, ModuleFileNode } from './frontend/ast.js';
import { parseModuleFile } from './frontend/parser.js';
import { lintCaseStyle } from './lint/case_style.js';
import { emitProgram } from './lowering/emit.js';
import type { Artifact } from './formats/types.js';
import { buildEnv } from './semantics/env.js';

function hasErrors(diagnostics: Diagnostic[]): boolean {
  return diagnostics.some((d) => d.severity === 'error');
}

function withDefaults(
  options: CompilerOptions,
): Required<Pick<CompilerOptions, 'emitBin' | 'emitHex' | 'emitD8m' | 'emitListing'>> {
  const anyPrimaryEmitSpecified = [options.emitBin, options.emitHex, options.emitD8m].some(
    (v) => v !== undefined,
  );

  const emitBin = anyPrimaryEmitSpecified ? (options.emitBin ?? false) : true;
  const emitHex = anyPrimaryEmitSpecified ? (options.emitHex ?? false) : true;
  const emitD8m = anyPrimaryEmitSpecified ? (options.emitD8m ?? false) : true;

  // Listing is a sidecar artifact: default to on unless explicitly suppressed.
  const emitListing = options.emitListing ?? true;

  return { emitBin, emitHex, emitD8m, emitListing };
}

function normalizePath(p: string): string {
  return resolve(p);
}

function canonicalModuleId(modulePath: string): string {
  const base = basename(modulePath);
  const ext = extname(base);
  return ext.length > 0 ? base.slice(0, -ext.length) : base;
}

function importTargets(moduleFile: ModuleFileNode): ImportNode[] {
  return moduleFile.items.filter((i): i is ImportNode => i.kind === 'Import');
}

function importCandidatePath(imp: ImportNode): string {
  if (imp.form === 'path') return imp.specifier;
  return `${imp.specifier}.zax`;
}

function resolveImportCandidates(
  fromModulePath: string,
  imp: ImportNode,
  includeDirs: string[],
): string[] {
  const fromDir = dirname(fromModulePath);
  const candidateRel = importCandidatePath(imp);

  const out: string[] = [];
  out.push(normalizePath(resolve(fromDir, candidateRel)));
  for (const inc of includeDirs) {
    out.push(normalizePath(resolve(inc, candidateRel)));
  }
  // De-dupe while preserving order.
  const seen = new Set<string>();
  return out.filter((p) => (seen.has(p) ? false : (seen.add(p), true)));
}

function isIgnorableImportProbeError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const code = (err as { code?: unknown }).code;
  return code === 'ENOENT' || code === 'ENOTDIR';
}

type LoadedProgram = {
  program: ProgramNode;
  sourceTexts: Map<string, string>;
};

async function loadProgram(
  entryFile: string,
  diagnostics: Diagnostic[],
  options: Pick<CompilerOptions, 'includeDirs'>,
): Promise<LoadedProgram | undefined> {
  const entryPath = normalizePath(entryFile);
  const modules = new Map<string, ModuleFileNode>();
  const sourceTexts = new Map<string, string>();
  const edges = new Map<string, Map<string, { line: number; column: number }>>();
  const includeDirs = (options.includeDirs ?? []).map(normalizePath);

  const loadModule = async (
    modulePath: string,
    importer?: string,
    preloadedText?: string,
  ): Promise<void> => {
    const p = normalizePath(modulePath);
    if (modules.has(p)) return;

    let sourceText: string;
    try {
      sourceText = preloadedText ?? (await readFile(p, 'utf8'));
    } catch (err) {
      diagnostics.push({
        id: DiagnosticIds.IoReadFailed,
        severity: 'error',
        message: importer
          ? `Failed to read imported module "${p}" (imported by "${importer}"): ${String(err)}`
          : `Failed to read entry file: ${String(err)}`,
        file: importer ?? p,
      });
      return;
    }

    let moduleFile: ModuleFileNode;
    try {
      moduleFile = parseModuleFile(p, sourceText, diagnostics);
    } catch (err) {
      diagnostics.push({
        id: DiagnosticIds.InternalParseError,
        severity: 'error',
        message: `Internal error during parse: ${String(err)}`,
        file: p,
      });
      return;
    }

    modules.set(p, moduleFile);
    sourceTexts.set(p, sourceText);
    edges.set(p, new Map());

    for (const imp of importTargets(moduleFile)) {
      const candidates = resolveImportCandidates(p, imp, includeDirs);
      let resolved: string | undefined;
      let resolvedText: string | undefined;
      let hardFailure = false;

      for (const c of candidates) {
        try {
          // eslint-disable-next-line no-await-in-loop
          resolvedText = await readFile(c, 'utf8');
          resolved = c;
          break;
        } catch (err) {
          if (isIgnorableImportProbeError(err)) {
            // keep trying
            continue;
          }

          diagnostics.push({
            id: DiagnosticIds.IoReadFailed,
            severity: 'error',
            message: `Failed to read import candidate "${c}" while resolving imports for "${p}": ${String(
              err,
            )}`,
            file: p,
            line: imp.span.start.line,
            column: imp.span.start.column,
          });
          hardFailure = true;
          break;
        }
      }

      if (hardFailure) return;

      if (!resolved || resolvedText === undefined) {
        const pretty = imp.form === 'path' ? `"${imp.specifier}"` : imp.specifier;
        diagnostics.push({
          id: DiagnosticIds.ImportNotFound,
          severity: 'error',
          message: `Failed to resolve import ${pretty} from "${p}". Tried:\n${candidates
            .map((c) => `- ${c}`)
            .join('\n')}`,
          file: p,
          line: imp.span.start.line,
          column: imp.span.start.column,
        });
        continue;
      }

      const moduleEdges = edges.get(p)!;
      if (!moduleEdges.has(resolved)) {
        moduleEdges.set(resolved, {
          line: imp.span.start.line,
          column: imp.span.start.column,
        });
      }
      await loadModule(resolved, p, resolvedText);
    }
  };

  await loadModule(entryPath);
  if (hasErrors(diagnostics)) return undefined;

  // Detect module-ID collisions (case-insensitive).
  const idSeen = new Map<string, string>();
  for (const p of modules.keys()) {
    const id = canonicalModuleId(p);
    const k = id.toLowerCase();
    const prev = idSeen.get(k);
    if (prev && prev !== p) {
      const moduleSpan = modules.get(p)?.span.start;
      diagnostics.push({
        id: DiagnosticIds.SemanticsError,
        severity: 'error',
        message: `Module ID collision: "${id}" maps to both "${prev}" and "${p}".`,
        file: p,
        ...(moduleSpan !== undefined ? { line: moduleSpan.line, column: moduleSpan.column } : {}),
      });
    } else {
      idSeen.set(k, p);
    }
  }
  if (hasErrors(diagnostics)) return undefined;

  // Topological order (dependencies first), deterministic by (moduleId, path).
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const order: string[] = [];

  const sortKey = (p: string) => `${canonicalModuleId(p).toLowerCase()}\n${p}`;

  const visit = (p: string, stack: string[], fromModule?: string) => {
    if (visited.has(p)) return;
    if (visiting.has(p)) {
      const cycleStart = stack.indexOf(p);
      const cycle = cycleStart >= 0 ? stack.slice(cycleStart).concat([p]) : stack.concat([p]);
      const edge = fromModule ? edges.get(fromModule)?.get(p) : undefined;
      diagnostics.push({
        id: DiagnosticIds.SemanticsError,
        severity: 'error',
        message: `Import cycle detected: ${cycle.join(' -> ')}`,
        file: fromModule ?? entryPath,
        ...(edge !== undefined ? { line: edge.line, column: edge.column } : {}),
      });
      return;
    }
    visiting.add(p);
    const deps = Array.from((edges.get(p) ?? new Map()).keys()).sort((a, b) =>
      sortKey(a).localeCompare(sortKey(b)),
    );
    for (const d of deps) {
      visit(d, stack.concat([p]), p);
      if (hasErrors(diagnostics)) return;
    }
    visiting.delete(p);
    visited.add(p);
    order.push(p);
  };

  visit(entryPath, []);
  if (hasErrors(diagnostics)) return undefined;

  const moduleFiles = order.map((p) => modules.get(p)!).filter(Boolean);
  const entryModule = modules.get(entryPath);
  if (!entryModule) return undefined;

  return {
    program: { kind: 'Program', span: entryModule.span, entryFile: entryPath, files: moduleFiles },
    sourceTexts,
  };
}

/**
 * Compile a ZAX program starting from an entry file.
 *
 * - Resolves imports transitively (deterministic topological order with cycle checks).
 * - Runs parse → semantics → lowering → format writers.
 * - Produces artifacts in-memory via `deps.formats`.
 * - Defaults to emitting BIN + HEX + D8M unless an emit flag is explicitly provided.
 */
export const compile: CompileFn = async (
  entryFile: string,
  options: CompilerOptions,
  deps: PipelineDeps,
): Promise<CompileResult> => {
  const entryPath = normalizePath(entryFile);
  const diagnostics: Diagnostic[] = [];
  const loaded = await loadProgram(entryPath, diagnostics, options);
  if (!loaded) return { diagnostics, artifacts: [] };
  const { program, sourceTexts } = loaded;

  if (hasErrors(diagnostics)) {
    return { diagnostics, artifacts: [] };
  }

  const hasNonImportDeclaration = program.files.some((moduleFile) =>
    moduleFile.items.some((item) => item.kind !== 'Import'),
  );
  if (!hasNonImportDeclaration) {
    diagnostics.push({
      id: DiagnosticIds.SemanticsError,
      severity: 'error',
      message: 'Program contains no declarations or instruction streams.',
      file: program.entryFile,
      ...(program.span?.start
        ? { line: program.span.start.line, column: program.span.start.column }
        : {}),
    });
    return { diagnostics, artifacts: [] };
  }

  lintCaseStyle(program, sourceTexts, options.caseStyle ?? 'off', diagnostics);

  const env = buildEnv(program, diagnostics, {
    typePaddingWarnings: options.typePaddingWarnings ?? false,
  });
  if (hasErrors(diagnostics)) {
    return { diagnostics, artifacts: [] };
  }

  const { map, symbols } = emitProgram(program, env, diagnostics, {
    ...(options.includeDirs ? { includeDirs: options.includeDirs } : {}),
    ...(options.opStackPolicy ? { opStackPolicy: options.opStackPolicy } : {}),
  });
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
    artifacts.push(deps.formats.writeD8m(map, symbols, { rootDir: dirname(entryPath) }));
  }
  if (emit.emitListing) {
    if (deps.formats.writeListing) {
      artifacts.push(deps.formats.writeListing(map, symbols));
    } else {
      diagnostics.push({
        id: DiagnosticIds.Unknown,
        severity: 'warning',
        message: 'emitListing=true but no listing writer is configured; skipping .lst artifact.',
        file: program.entryFile,
      });
    }
  }

  return { diagnostics, artifacts };
};

import type { Diagnostic } from './diagnostics/types.js';
import type { Artifact, FormatWriters } from './formats/types.js';

/**
 * Options that influence compilation behavior and which artifacts are produced.
 *
 * PR1 implementation note: most options are accepted but only a subset is currently honored.
 */
export interface CompilerOptions {
  /**
   * Additional include/search directories used for module resolution.
   *
   * These directories are consulted when resolving `import` statements after checking paths relative to the
   * importing module.
   */
  includeDirs?: string[];
  /** Primary output path used to derive sibling artifacts (future). */
  outputPath?: string;
  /** Primary output type (future). */
  outputType?: 'hex' | 'bin';
  /** Emit flat binary (`.bin`). */
  emitBin?: boolean;
  /** Emit Intel HEX (`.hex`). */
  emitHex?: boolean;
  /** Emit D8 Debug Map (`.d8dbg.json`). */
  emitD8m?: boolean;
  /** Emit listing (`.lst`). */
  emitListing?: boolean;
}

/**
 * Result of a compilation run: diagnostics plus any produced artifacts.
 */
export interface CompileResult {
  diagnostics: Diagnostic[];
  artifacts: Artifact[];
}

/**
 * Dependency injection surface for the compiler pipeline.
 *
 * Callers provide concrete format writers so the core pipeline can be pure/in-memory.
 */
export interface PipelineDeps {
  formats: FormatWriters;
}

/**
 * Top-level compile function signature used by the pipeline contract.
 */
export type CompileFn = (
  entryFile: string,
  options: CompilerOptions,
  deps: PipelineDeps,
) => Promise<CompileResult>;

import type { Diagnostic } from './diagnostics/types.js';
import type { Artifact, FormatWriters } from './formats/types.js';

export interface CompilerOptions {
  includeDirs?: string[];
  outputPath?: string;
  outputType?: 'hex' | 'bin';
  emitBin?: boolean;
  emitHex?: boolean;
  emitD8m?: boolean;
  emitListing?: boolean;
}

export interface CompileResult {
  diagnostics: Diagnostic[];
  artifacts: Artifact[];
}

export interface PipelineDeps {
  formats: FormatWriters;
}

export type CompileFn = (
  entryFile: string,
  options: CompilerOptions,
  deps: PipelineDeps,
) => Promise<CompileResult>;

import { isAbsolute, relative, resolve } from 'node:path';

import type {
  D8mArtifact,
  D8mJson,
  EmittedByteMap,
  SymbolEntry,
  WriteD8mOptions,
} from './types.js';
import { getWrittenRange, getWrittenSegments } from './range.js';

function normalizeD8mPath(file: string, rootDir?: string): string {
  const withSlashes = file.replace(/\\/g, '/');
  if (!rootDir) return withSlashes;
  const absFile = resolve(file);
  const absRoot = resolve(rootDir);
  const rel = relative(absRoot, absFile);
  if (!rel || rel.startsWith('..') || isAbsolute(rel)) {
    return absFile.replace(/\\/g, '/');
  }
  return rel.replace(/\\/g, '/');
}

/**
 * Create a minimal D8 Debug Map (D8M) v1 JSON artifact.
 *
 * PR1 implementation note:
 * - Includes only basic segments and a flat list of symbols.
 * - Does not emit instruction-to-source mappings yet.
 */
export function writeD8m(
  map: EmittedByteMap,
  symbols: SymbolEntry[],
  opts?: WriteD8mOptions,
): D8mArtifact {
  const { start, end } = getWrittenRange(map);
  const writtenSegments = getWrittenSegments(map);
  const segments =
    writtenSegments.length > 0
      ? writtenSegments
      : start < end
        ? [{ start, end }]
        : [{ start: 0, end: 0 }];

  const normalizedSymbols = symbols.map((s) => ({
    ...s,
    ...(s.file !== undefined ? { file: normalizeD8mPath(s.file, opts?.rootDir) } : {}),
  }));
  const fileSet = new Set(
    normalizedSymbols
      .map((s) => s.file)
      .filter((f): f is string => typeof f === 'string' && f.length > 0),
  );
  const files = Array.from(fileSet).sort((a, b) => a.localeCompare(b));

  const json: D8mJson = {
    format: 'd8-debug-map',
    version: 1,
    arch: 'z80',
    addressWidth: 16,
    endianness: 'little',
    segments,
    ...(files.length > 0 ? { files } : {}),
    symbols: normalizedSymbols.map((s) => ({
      name: s.name,
      kind: s.kind,
      ...(s.kind === 'constant' ? { value: s.value } : { address: s.address }),
      ...(s.kind === 'constant' && s.address !== undefined ? { address: s.address } : {}),
      ...(s.file !== undefined ? { file: s.file } : {}),
      ...(s.line !== undefined ? { line: s.line } : {}),
      ...(s.scope !== undefined ? { scope: s.scope } : {}),
      ...(s.kind !== 'constant' && s.size !== undefined ? { size: s.size } : {}),
    })),
  };

  return { kind: 'd8m', json };
}

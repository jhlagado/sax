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

type D8mSegment = {
  start: number;
  end: number;
  lstLine: number;
  kind: 'code' | 'data' | 'directive' | 'label' | 'macro' | 'unknown';
  confidence: 'high' | 'medium' | 'low';
};

type D8mSerializedSymbol =
  | {
      name: string;
      kind: 'constant';
      value: number;
      address?: number;
      file?: string;
      line?: number;
      scope?: 'global' | 'local';
    }
  | {
      name: string;
      kind: 'label' | 'data' | 'var' | 'unknown';
      address: number;
      file?: string;
      line?: number;
      scope?: 'global' | 'local';
      size?: number;
    };

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
  const fileList = Array.from(fileSet).sort((a, b) => a.localeCompare(b));

  const serializedSymbols: D8mSerializedSymbol[] = normalizedSymbols.map((s) => {
    if (s.kind === 'constant') {
      return {
        name: s.name,
        kind: 'constant',
        value: s.value,
        ...(s.address !== undefined ? { address: s.address } : {}),
        ...(s.file !== undefined ? { file: s.file } : {}),
        ...(s.line !== undefined ? { line: s.line } : {}),
        ...(s.scope !== undefined ? { scope: s.scope } : {}),
      };
    }
    return {
      name: s.name,
      kind: s.kind,
      address: s.address,
      ...(s.file !== undefined ? { file: s.file } : {}),
      ...(s.line !== undefined ? { line: s.line } : {}),
      ...(s.scope !== undefined ? { scope: s.scope } : {}),
      ...(s.size !== undefined ? { size: s.size } : {}),
    };
  });

  const fileEntries = new Map<
    string,
    {
      symbols: Array<Record<string, unknown>>;
      segments: D8mSegment[];
    }
  >();
  const ensureFileEntry = (path: string) => {
    let entry = fileEntries.get(path);
    if (!entry) {
      entry = { symbols: [], segments: [] };
      fileEntries.set(path, entry);
    }
    return entry;
  };

  for (const symbol of serializedSymbols) {
    const key = symbol.file ?? '';
    const entry = ensureFileEntry(key);
    const { file: _file, ...withoutFile } = symbol;
    entry.symbols.push(withoutFile as Record<string, unknown>);
  }

  const segmentFileKey = fileList[0] ?? '';
  const segmentEntry = ensureFileEntry(segmentFileKey);
  segmentEntry.segments.push(
    ...segments.map((segment) => ({
      start: segment.start,
      end: segment.end,
      lstLine: 0,
      kind: 'unknown' as const,
      confidence: 'low' as const,
    })),
  );

  const files = Object.fromEntries(
    Array.from(fileEntries.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([path, entry]) => [
        path,
        {
          ...(entry.segments.length > 0 ? { segments: entry.segments } : {}),
          ...(entry.symbols.length > 0 ? { symbols: entry.symbols } : {}),
        },
      ]),
  );

  const json: D8mJson = {
    format: 'd8-debug-map',
    version: 1,
    arch: 'z80',
    addressWidth: 16,
    endianness: 'little',
    files,
    segments,
    ...(fileList.length > 0 ? { fileList } : {}),
    symbols: serializedSymbols,
  };

  return { kind: 'd8m', json };
}

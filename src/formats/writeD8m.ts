import type {
  D8mArtifact,
  D8mJson,
  EmittedByteMap,
  SymbolEntry,
  WriteD8mOptions,
} from './types.js';

function getRange(map: EmittedByteMap): { start: number; end: number } {
  if (map.writtenRange) return map.writtenRange;
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const addr of map.bytes.keys()) {
    min = Math.min(min, addr);
    max = Math.max(max, addr);
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) return { start: 0, end: 0 };
  return { start: min, end: max + 1 };
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
  _opts?: WriteD8mOptions,
): D8mArtifact {
  const { start, end } = getRange(map);

  const json: D8mJson = {
    format: 'd8-debug-map',
    version: 1,
    arch: 'z80',
    segments: [{ start, end }],
    symbols: symbols.map((s) => ({
      name: s.name,
      kind: s.kind,
      address: s.address,
      file: s.file,
      line: s.line,
      scope: s.scope,
      size: s.size,
    })),
  };

  return { kind: 'd8m', json };
}

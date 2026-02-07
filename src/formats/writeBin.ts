import type { BinArtifact, EmittedByteMap, SymbolEntry, WriteBinOptions } from './types.js';

function rangeFromMap(map: EmittedByteMap): { start: number; end: number } {
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
 * Create a flat binary artifact from an emitted address->byte map.
 *
 * Bytes are emitted for the computed written range; unwritten addresses inside the range are `0x00`.
 */
export function writeBin(
  map: EmittedByteMap,
  _symbols: SymbolEntry[],
  _opts?: WriteBinOptions,
): BinArtifact {
  const { start, end } = rangeFromMap(map);
  const out = new Uint8Array(Math.max(0, end - start));
  for (let i = 0; i < out.length; i++) {
    const addr = start + i;
    out[i] = map.bytes.get(addr) ?? 0;
  }
  return { kind: 'bin', bytes: out };
}

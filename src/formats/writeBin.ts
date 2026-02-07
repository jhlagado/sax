import type { BinArtifact, EmittedByteMap, SymbolEntry, WriteBinOptions } from './types.js';
import { getWrittenRange } from './range.js';

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
  const { start, end } = getWrittenRange(map);
  const out = new Uint8Array(Math.max(0, end - start));
  for (let i = 0; i < out.length; i++) {
    const addr = start + i;
    out[i] = map.bytes.get(addr) ?? 0;
  }
  return { kind: 'bin', bytes: out };
}

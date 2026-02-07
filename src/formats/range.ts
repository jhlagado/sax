import type { AddressRange, EmittedByteMap } from './types.js';

/**
 * Compute the effective written range for an emitted byte map.
 *
 * - If `map.writtenRange` is present, it is returned directly.
 * - Otherwise, the range is derived from the min/max written addresses.
 * - For an empty map, `{ start: 0, end: 0 }` is returned.
 */
export function getWrittenRange(map: EmittedByteMap): AddressRange {
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

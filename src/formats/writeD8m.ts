import type {
  D8mArtifact,
  D8mJson,
  EmittedByteMap,
  SymbolEntry,
  WriteD8mOptions,
} from './types.js';
import { getWrittenRange } from './range.js';

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
  const { start, end } = getWrittenRange(map);

  const json: D8mJson = {
    format: 'd8-debug-map',
    version: 1,
    arch: 'z80',
    segments: [{ start, end }],
    symbols: symbols.map((s) => ({
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

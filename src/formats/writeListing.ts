import type { EmittedByteMap, ListingArtifact, SymbolEntry, WriteListingOptions } from './types.js';
import { getWrittenRange } from './range.js';

function toHexByte(n: number): string {
  return (n & 0xff).toString(16).toUpperCase().padStart(2, '0');
}

function toHexWord(n: number): string {
  return (n & 0xffff).toString(16).toUpperCase().padStart(4, '0');
}

function toAsciiByte(n: number): string {
  const v = n & 0xff;
  return v >= 0x20 && v <= 0x7e ? String.fromCharCode(v) : '.';
}

function formatSymbol(s: SymbolEntry): string {
  if (s.kind === 'constant') {
    const value = s.value & 0xffff;
    return `${s.kind} ${s.name} = $${toHexWord(value)} (${s.value})`;
  }
  return `${s.kind} ${s.name} = $${toHexWord(s.address)}`;
}

function sortSymbols(a: SymbolEntry, b: SymbolEntry): number {
  const aKey =
    a.kind === 'constant'
      ? `1\n${toHexWord(a.value & 0xffff)}\n${a.name.toLowerCase()}`
      : `0\n${toHexWord(a.address)}\n${a.name.toLowerCase()}`;
  const bKey =
    b.kind === 'constant'
      ? `1\n${toHexWord(b.value & 0xffff)}\n${b.name.toLowerCase()}`
      : `0\n${toHexWord(b.address)}\n${b.name.toLowerCase()}`;
  return aKey.localeCompare(bKey);
}

/**
 * Create a deterministic `.lst` listing artifact.
 *
 * Current implementation is a stable byte dump + symbol table. It does not yet include per-instruction
 * source mapping; D8M should be used for debuggers.
 */
export function writeListing(
  map: EmittedByteMap,
  symbols: SymbolEntry[],
  opts?: WriteListingOptions,
): ListingArtifact {
  const lineEnding = opts?.lineEnding ?? '\n';
  const bytesPerLine = opts?.bytesPerLine ?? 16;
  const { start, end } = getWrittenRange(map);

  const lines: string[] = [];
  lines.push('; ZAX listing');
  lines.push(`; range: $${toHexWord(start)}..$${toHexWord(end)} (end exclusive)`);
  lines.push('');

  for (let addr = start; addr < end; addr += bytesPerLine) {
    const count = Math.min(bytesPerLine, end - addr);
    const hexBytes: string[] = [];
    const asciiBytes: string[] = [];
    for (let i = 0; i < count; i++) {
      const byte = map.bytes.get(addr + i);
      if (byte === undefined) {
        hexBytes.push('..');
        asciiBytes.push(' ');
        continue;
      }
      hexBytes.push(toHexByte(byte));
      asciiBytes.push(toAsciiByte(byte));
    }
    const paddedHex = hexBytes.join(' ').padEnd(bytesPerLine * 3 - 1, ' ');
    lines.push(`${toHexWord(addr)}: ${paddedHex}  |${asciiBytes.join('')}|`);
  }

  lines.push('');
  lines.push('; symbols:');
  for (const s of [...symbols].sort(sortSymbols)) {
    lines.push(`; ${formatSymbol(s)}`);
  }

  return { kind: 'lst', text: lines.join(lineEnding) + lineEnding };
}

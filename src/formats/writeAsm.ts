import type {
  AsmArtifact,
  EmittedAsmTraceEntry,
  EmittedByteMap,
  SymbolEntry,
  WriteAsmOptions,
} from './types.js';
import { getWrittenRange } from './range.js';

function toHexByte(n: number): string {
  return (n & 0xff).toString(16).toUpperCase().padStart(2, '0');
}

function toHexWord(n: number): string {
  return (n & 0xffff).toString(16).toUpperCase().padStart(4, '0');
}

function compareTrace(a: EmittedAsmTraceEntry, b: EmittedAsmTraceEntry): number {
  if (a.offset !== b.offset) return a.offset - b.offset;

  const rank = (entry: EmittedAsmTraceEntry): number => {
    if (entry.kind === 'comment') return 0;
    if (entry.kind === 'label') return 1;
    return 2;
  };
  const r = rank(a) - rank(b);
  if (r !== 0) return r;

  if (a.kind === 'label' && b.kind === 'label') return a.name.localeCompare(b.name);
  if (a.kind === 'instruction' && b.kind === 'instruction') return a.text.localeCompare(b.text);
  if (a.kind === 'comment' && b.kind === 'comment') return a.text.localeCompare(b.text);
  return 0;
}

function stableSymbols(symbols: SymbolEntry[]): SymbolEntry[] {
  return [...symbols].sort((a, b) => {
    const aAddr = a.kind === 'constant' ? 0x10000 : a.address & 0xffff;
    const bAddr = b.kind === 'constant' ? 0x10000 : b.address & 0xffff;
    if (aAddr !== bAddr) return aAddr - bAddr;
    return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
  });
}

/**
 * Create a deterministic `.asm` artifact from lowering trace entries.
 */
export function writeAsm(
  map: EmittedByteMap,
  symbols: SymbolEntry[],
  opts?: WriteAsmOptions,
): AsmArtifact {
  const lineEnding = opts?.lineEnding ?? '\n';
  const { start, end } = getWrittenRange(map);

  const lines: string[] = [];
  lines.push('; ZAX lowered .asm trace');
  lines.push(`; range: $${toHexWord(start)}..$${toHexWord(end)} (end exclusive)`);
  lines.push('');

  const trace = [...(map.asmTrace ?? [])].sort(compareTrace);
  if (trace.length === 0) {
    lines.push('; no code trace available');
  } else {
    for (const entry of trace) {
      if (entry.kind === 'comment') {
        lines.push(`; ${entry.text}`);
        continue;
      }
      if (entry.kind === 'label') {
        lines.push(`${entry.name}:`);
        continue;
      }
      const bytes = entry.bytes.map((b) => toHexByte(b)).join(' ');
      lines.push(`${toHexWord(entry.offset)}: ${bytes.padEnd(11, ' ')}  ${entry.text}`);
    }
  }

  lines.push('');
  lines.push('; symbols:');
  for (const s of stableSymbols(symbols)) {
    if (s.kind === 'constant') {
      lines.push(`; constant ${s.name} = $${toHexWord(s.value)} (${s.value})`);
    } else {
      lines.push(`; ${s.kind} ${s.name} = $${toHexWord(s.address)}`);
    }
  }

  return { kind: 'asm', text: lines.join(lineEnding) + lineEnding };
}

export interface OpcodeTraceEntry {
  address: number;
  bytes: Uint8Array;
}

export interface OpcodeMismatch {
  offset: number;
  expected: number;
  actual: number;
}

export function parseAsmTraceOpcodeEntries(text: string): OpcodeTraceEntry[] {
  const entries: OpcodeTraceEntry[] = [];
  const lines = text.split(/\r?\n/);
  const tracePattern = /;\s*([0-9A-Fa-f]{4}):\s*([0-9A-Fa-f]{2}(?:\s+[0-9A-Fa-f]{2})*)\s*$/;

  for (const line of lines) {
    const match = line.match(tracePattern);
    if (!match) continue;
    const addressText = match[1];
    const byteText = match[2];
    if (!addressText || !byteText) continue;
    const address = Number.parseInt(addressText, 16);
    const byteTokens = byteText.trim().split(/\s+/);
    const bytes = new Uint8Array(byteTokens.map((token) => Number.parseInt(token, 16)));
    entries.push({ address, bytes });
  }

  return entries;
}

export function flattenTraceBytes(entries: OpcodeTraceEntry[]): Uint8Array {
  const values: number[] = [];
  for (const entry of entries) {
    values.push(...entry.bytes);
  }
  return Uint8Array.from(values);
}

export function parseExpectedHexBytes(hex: string): Uint8Array {
  const normalized = hex.replace(/\s+/g, '').trim();
  if (normalized.length === 0) return new Uint8Array();
  if (normalized.length % 2 !== 0) {
    throw new Error(`Expected even-length hex string, got ${normalized.length} characters.`);
  }
  const bytes = new Uint8Array(normalized.length / 2);
  for (let i = 0; i < normalized.length; i += 2) {
    bytes[i / 2] = Number.parseInt(normalized.slice(i, i + 2), 16);
  }
  return bytes;
}

export function findOpcodeMismatch(
  expected: Uint8Array,
  actual: Uint8Array,
): OpcodeMismatch | undefined {
  const limit = Math.min(expected.length, actual.length);
  for (let i = 0; i < limit; i += 1) {
    const expectedValue = expected[i];
    const actualValue = actual[i];
    if (expectedValue === undefined || actualValue === undefined) continue;
    if (expectedValue !== actualValue) {
      return { offset: i, expected: expectedValue, actual: actualValue };
    }
  }
  if (expected.length !== actual.length) {
    const offset = limit;
    return {
      offset,
      expected: expected[offset] ?? Number.NaN,
      actual: actual[offset] ?? Number.NaN,
    };
  }
  return undefined;
}

export function assertOpcodeVerification(
  label: string,
  expected: Uint8Array,
  actual: Uint8Array,
): void {
  const mismatch = findOpcodeMismatch(expected, actual);
  if (!mismatch) return;

  const formatByte = (v: number): string => {
    if (Number.isNaN(v)) return '<none>';
    return `$${v.toString(16).toUpperCase().padStart(2, '0')}`;
  };
  const address = `$${mismatch.offset.toString(16).toUpperCase().padStart(4, '0')}`;
  throw new Error(
    [
      `[opcode-verify] ${label} mismatch`,
      `offset=${address}`,
      `expected=${formatByte(mismatch.expected)}`,
      `actual=${formatByte(mismatch.actual)}`,
      `expected_len=${expected.length}`,
      `actual_len=${actual.length}`,
    ].join(' '),
  );
}

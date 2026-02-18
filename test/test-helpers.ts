export function stripStdEnvelope(bytes: Uint8Array): Uint8Array {
  const prefix = [0xf5, 0xc5, 0xd5];
  const suffix = [0xd1, 0xc1, 0xf1, 0xc9];
  const starts = prefix.every((b, i) => bytes[i] === b);
  const ends = suffix.every((b, i) => bytes[bytes.length - suffix.length + i] === b);
  if (starts && ends && bytes.length >= prefix.length + suffix.length) {
    return bytes.slice(prefix.length, bytes.length - suffix.length);
  }
  return bytes;
}

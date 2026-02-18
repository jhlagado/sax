import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const BASELINE_EXPECTED = join(
  __dirname,
  '..',
  'examples',
  'language-tour',
  '00_call_with_arg_and_local_baseline.expected-v02.asm',
);

// Hand-authored canonical baseline lock.
const EXPECTED_SHA256 = '9fa97913d9b9380dd3cd3d04a5dcf50f37cb61ead28f401f273db67e80b9c75f';

describe('PR307: baseline expected-v02 lock', () => {
  it('keeps the hand-authored expected-v02 baseline file unchanged', async () => {
    const text = await readFile(BASELINE_EXPECTED, 'utf8');
    const sha = createHash('sha256').update(text, 'utf8').digest('hex');

    expect(text).toContain('; ZAX expected lowered .asm trace (v0.2 spec-aligned)');
    expect(text).toContain('; func inc_one begin (expected)');
    expect(text).toContain('; func main begin (expected)');
    expect(sha).toBe(EXPECTED_SHA256);
  });
});

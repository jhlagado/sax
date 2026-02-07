import { describe, expect, it } from 'vitest';

// PR0 is contracts-only (types/interfaces). This smoke test ensures the
// TypeScript/ESM/Vitest plumbing can import the modules successfully.
import '../src/pipeline.js';

describe('smoke', () => {
  it('loads', () => {
    expect(true).toBe(true);
  });
});

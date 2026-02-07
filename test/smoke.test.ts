import { describe, expect, it } from 'vitest';

import '../src/pipeline.js';

/*
PR0 is contracts-only (types/interfaces). This smoke test ensures the
TypeScript/ESM/Vitest plumbing can import the modules successfully.
*/
describe('smoke', () => {
  it('loads', () => {
    expect(true).toBe(true);
  });
});

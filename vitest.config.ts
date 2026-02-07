import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
  coverage: {
    provider: 'v8',
    reporter: ['text', 'lcov'],
    include: ['src/**/*.ts'],
    exclude: [
      'src/frontend/ast.ts',
      'src/diagnostics/types.ts',
      'src/formats/types.ts',
      'src/pipeline.ts',
    ],
    thresholds: {
      // Start moderate; raise over time as coverage improves.
      statements: 60,
      branches: 45,
      functions: 55,
      lines: 60,
    },
  },
});

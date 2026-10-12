import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Use the Node environment — no DOM emulation needed; we mock fetch by injection
    environment: 'node',
    globals: false,         // explicit imports only — no accidental globals
    include: ['test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/index.ts'],  // re-export barrel adds no logic
      reporter: ['text', 'lcov'],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
    },
  },
});


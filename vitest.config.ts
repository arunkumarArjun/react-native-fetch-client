import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      'react-native-fetch-client/mock': path.resolve(__dirname, 'src/mock.ts'),
      'react-native-fetch-client/offline': path.resolve(__dirname, 'src/offline/index.ts'),
      'react-native-fetch-client': path.resolve(__dirname, 'src/index.ts'),
    },
  },
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


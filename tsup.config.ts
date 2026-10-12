import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: false,        // no source maps in published package
  clean: true,             // wipe dist/ before each build
  splitting: false,        // single-file output per format for predictable imports
  treeshake: true,
  tsconfig: 'tsconfig.build.json',
  outDir: 'dist',
  // Ensure CJS and ESM get distinct file extensions so Node can identify them
  // even inside a package with "type": "module"
  outExtension({ format }) {
    return { js: format === 'cjs' ? '.cjs' : '.mjs' };
  },
  esbuildOptions(options) {
    // Target environments: modern Node, modern browsers, React Native Hermes
    options.target = ['es2022', 'node18'];
  },
});


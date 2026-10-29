import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    mock: 'src/mock.ts',
    offline: 'src/offline/index.ts',
  },
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true, // enable source maps for debuggability and Socket.dev source transparency
  clean: true, // wipe dist/ before each build
  splitting: false, // single-file output per format for predictable imports
  treeshake: true,
  cjsInterop: true,
  minify: false, // Distribute clean transpiled code; consumer bundlers (Metro/Webpack/Vite) handle minification
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


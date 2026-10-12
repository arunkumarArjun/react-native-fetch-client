// @ts-check
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: __dirname,
      },
    },
    rules: {
      // Enforce explicit return types on exported functions
      '@typescript-eslint/explicit-module-boundary-types': 'error',
      // No floating promises
      '@typescript-eslint/no-floating-promises': 'error',
      // No explicit `any`
      '@typescript-eslint/no-explicit-any': 'error',
      // Unused vars with underscore prefix exemption
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      // Prefer type imports to avoid accidental value imports
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
      // No non-null assertions
      '@typescript-eslint/no-non-null-assertion': 'error',
      // Turn off base rule in favour of @typescript-eslint version
      'no-unused-vars': 'off',
    },
  },
  {
    // Relax some rules in test files
    files: ['test/**/*.ts'],
    rules: {
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
  {
    ignores: ['dist/**', 'node_modules/**', 'coverage/**'],
  },
);


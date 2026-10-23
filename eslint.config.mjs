/**
 * Lint configuration.
 *
 * Scope: every hand-written source file — the packages, the design system, the
 * scripts and the Node tests. Generated artefacts (the gallery, token output) are
 * ignored: linting a generated file only ever reports the generator's choices.
 * `packages/ui` joined in P1a, with the React 19 migration.
 *
 * Rules chosen for things TypeScript cannot see: a stray `console` in library
 * code, `==`, `var`, an unused import that survived a refactor.
 */
import tseslint from 'typescript-eslint';
import reactPlugin from 'eslint-plugin-react';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/.build/**',
      '**/dist/**',
      'builds/**',
      'privacy/**',
      'packages/ui/mockups/gallery/**',
      'prototype/**',
      'public/**',
    ],
  },
  ...tseslint.configs.recommended,
  {
    files: ['packages/{shared-types,core-analytics,connectors}/src/**/*.ts', 'packages/ui/{src,screens,mockups}/**/*.{ts,tsx}', 'apps/mobile/**/*.{ts,tsx}'],
    plugins: {
      react: reactPlugin,
    },
    settings: {
      react: { version: 'detect' },
    },
    rules: {
      'no-console': 'error',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'react/no-unescaped-entities': ['error', { forbid: ['<', '>', '{', '}'] }],
    },
  },
  {
    // Metro and Babel are loaded by CommonJS tooling; `require` is the API there.
    files: ['apps/mobile/*.config.js', 'apps/mobile/plugins/*.js'],
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
  {
    // Store uses any in a few places for dynamic SQLite rows – allowed
    files: ['packages/store/src/**/*.ts'],
    rules: { '@typescript-eslint/no-explicit-any': 'off' },
  },
  {
    files: ['scripts/**/*.mjs', 'tests/**/*.mjs'],
    rules: {
      'no-console': 'off',
      'no-var': 'error',
      eqeqeq: ['error', 'smart'],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['packages/**/tests/**/*.mjs'],
    rules: {
      'no-console': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
);

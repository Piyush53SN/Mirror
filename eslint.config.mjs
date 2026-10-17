/**
 * Lint configuration.
 *
 * Scope is deliberate: the P0 packages, the scripts and the Node tests. The
 * design system (`packages/ui`) is type-checked and covered by its own
 * source-rule tests today, and adding a linter to 28 approved screens at the
 * same time as the React 19 migration would mix two changes in one review — it
 * joins this config as the first step of P1a, when those files are being edited
 * anyway. Recorded in docs/PROGRESS.md rather than left as a silent gap.
 *
 * Rules chosen for things TypeScript cannot see: a stray `console` in library
 * code, `==`, `var`, an unused import that survived a refactor.
 */
import tseslint from 'typescript-eslint';

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
    files: ['packages/{shared-types,core-analytics,connectors}/src/**/*.ts'],
    rules: {
      'no-console': 'error',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['scripts/**/*.mjs', 'tests/**/*.mjs'],
    rules: {
      'no-console': 'off',
      'no-var': 'error',
      eqeqeq: ['error', 'smart'],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['packages/**/tests/**/*.mjs'],
    rules: {
      'no-console': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
);

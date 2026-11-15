import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/coverage/**',
      '**/.expo/**',
      'apps/mobile/android/**',
      'apps/mobile/ios/**',
      '**/*.config.js',
      '**/*.config.cjs',
      '**/babel.config.js',
      '**/metro.config.js',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-console': ['warn', { allow: ['warn', 'error', 'info'] }],
      // noUncheckedIndexedAccess is on, so `arr[i]!` after a bounds check is the intended idiom.
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
  {
    files: ['apps/mobile/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
  {
    files: ['packages/core/**/*.ts'],
    rules: {
      // core must stay pure: no React, no network, no Expo
      'no-restricted-imports': [
        'error',
        { patterns: ['react', 'react-native', 'expo*', 'node:*', 'fs', 'http', 'https'] },
      ],
    },
  },
);

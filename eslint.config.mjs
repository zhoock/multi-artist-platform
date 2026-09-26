// eslint.config.mjs

import { fileURLToPath } from 'url';
import { dirname } from 'path';
import js from '@eslint/js';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import reactPlugin from 'eslint-plugin-react';
import reactHooksPlugin from 'eslint-plugin-react-hooks';
import importPlugin from 'eslint-plugin-import';
import jsxA11yPlugin from 'eslint-plugin-jsx-a11y';
import eslintCommentsPlugin from 'eslint-plugin-eslint-comments';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const browserGlobals = {
  window: 'readonly',
  document: 'readonly',
  console: 'readonly',
  localStorage: 'readonly',
  HTMLElement: 'readonly',
  HTMLDivElement: 'readonly',
  HTMLAudioElement: 'readonly',
  HTMLInputElement: 'readonly',
  HTMLImageElement: 'readonly',
  HTMLDialogElement: 'readonly',
  MouseEvent: 'readonly',
  Node: 'readonly',
  screen: 'readonly',
};

export default [
  js.configs.recommended,

  // --- приложение (src) ---
  {
    files: ['src/**/*.{js,jsx,ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2020,
        sourceType: 'module',
        project: './tsconfig.eslint.json',
        tsconfigRootDir: __dirname,
      },
      globals: browserGlobals,
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
      react: reactPlugin,
      'react-hooks': reactHooksPlugin,
      import: importPlugin,
      'jsx-a11y': jsxA11yPlugin,
      'eslint-comments': eslintCommentsPlugin,
    },
    settings: {
      react: { version: 'detect' },
      'import/resolver': {
        typescript: { project: './tsconfig.json' },
        node: { extensions: ['.js', '.jsx', '.ts', '.tsx'] },
      },
    },
    rules: {
      ...jsxA11yPlugin.flatConfigs.recommended.rules,

      quotes: ['error', 'single', { avoidEscape: true }],
      semi: ['error', 'always'],

      // типскриптовые и общие послабления
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-require-imports': 'off',
      'react/prop-types': 'off',
      'react/jsx-uses-react': 'off',
      'react/react-in-jsx-scope': 'off',
      'no-undef': 'off',

      // реактовые хуки — ТУТ (где плагин подключён)
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },

  // --- jsx-a11y: test harness mocks (non-production DOM) ---
  {
    files: ['src/**/__tests__/**/*.{js,jsx,ts,tsx}'],
    rules: {
      'jsx-a11y/click-events-have-key-events': 'off',
      'jsx-a11y/no-static-element-interactions': 'off',
      'jsx-a11y/role-has-required-aria-props': 'off',
    },
  },

  // --- jsx-a11y: ARIA 1.3 aria-description on native buttons (plugin false positive) ---
  {
    files: [
      'src/entities/track/ui/TrackList.tsx',
      'src/widgets/albumTracks/ui/AlbumTracks.tsx',
      'src/pages/StemsPlayground/components/MixerTrackRow.tsx',
    ],
    rules: {
      'jsx-a11y/role-supports-aria-props': 'off',
    },
  },

  // --- конфиги/скрипты ноды (webpack, postcss) ---
  {
    files: ['webpack/**/*.js', 'postcss.config.js'],
    languageOptions: {
      parserOptions: { project: null },
      globals: { require: 'readonly', module: 'readonly', __dirname: 'readonly' },
    },
    rules: {
      // без react-hooks здесь — он не нужен для конфигов
      'no-undef': 'off',
      '@typescript-eslint/no-require-imports': 'off',
    },
  },

  // --- скрипты для браузера (export-localStorage.js) ---
  {
    files: ['scripts/export-localStorage.js'],
    languageOptions: {
      globals: {
        ...browserGlobals,
        Blob: 'readonly',
        URL: 'readonly',
      },
    },
    rules: {
      'no-undef': 'off',
      'no-console': 'off',
    },
  },

  // --- скрипты для Node.js (update-json-from-export.js, generate-encryption-key.js) ---
  {
    files: ['scripts/update-json-from-export.js', 'scripts/generate-encryption-key.js'],
    languageOptions: {
      globals: {
        require: 'readonly',
        module: 'readonly',
        __dirname: 'readonly',
        process: 'readonly',
        console: 'readonly',
      },
    },
    rules: {
      'no-undef': 'off',
      'no-console': 'off',
    },
  },

  // --- игноры ---
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'build/**',
      'storybook-static/**',
      'coverage/**',
      '*.d.ts',
      '**/*.d.ts',
      'commitlint.config.js',
      'webpack.config.js',
      // 'webpack/**/*.js', // уже описано выше в файлах
      'postcss.config.js',
      'babel.config.js',
      'jest.config.js',
      'jest.setup.ts',
      'index.d.ts',
    ],
  },
];

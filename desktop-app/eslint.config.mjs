import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Anchor type-aware linting to this directory regardless of cwd or Node version
// (avoids relying on import.meta.dirname, added only in Node 20.11+).
const tsconfigRootDir = dirname(fileURLToPath(import.meta.url));

/**
 * Flat ESLint config. The codebase splits cleanly along the Electron process
 * boundary, so lint env follows suit: node globals for main/preload/configs,
 * browser globals (+ React Hooks rules) for the renderer.
 *
 * Application source (`src/**`) is linted with type-aware rules (it has a
 * tsconfig); configs, scripts and e2e specs aren't part of a tsconfig, so they
 * stay on the syntactic ruleset.
 */
export default tseslint.config(
  { ignores: ['out/**', 'dist/**', 'node_modules/**', 'test-results/**', 'playwright-report/**'] },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  // Shared rules (syntactic — apply everywhere).
  {
    rules: {
      // Allow intentional throwaways prefixed with underscore.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      '@typescript-eslint/consistent-type-definitions': ['error', 'interface'],
      '@typescript-eslint/naming-convention': [
        'error',
        // Default: camelCase identifiers.
        { selector: 'default', format: ['camelCase'], leadingUnderscore: 'allow' },
        // Variables may be camelCase (locals), PascalCase (components/JSX),
        // or UPPER_CASE (module constants).
        { selector: 'variable', format: ['camelCase', 'PascalCase', 'UPPER_CASE'], leadingUnderscore: 'allow' },
        // Functions may be PascalCase (React components) as well as camelCase.
        { selector: 'function', format: ['camelCase', 'PascalCase'] },
        { selector: 'parameter', format: ['camelCase'], leadingUnderscore: 'allow' },
        // Types, interfaces, enums, components.
        { selector: 'typeLike', format: ['PascalCase'] },
        { selector: 'enumMember', format: ['PascalCase', 'UPPER_CASE'] },
        // Imports can be either (default imports of PascalCase modules/components).
        { selector: 'import', format: ['camelCase', 'PascalCase'] },
        // Object keys are data — don't constrain (CSS-ish keys, channel names, …).
        { selector: 'objectLiteralProperty', format: null },
        { selector: 'typeProperty', format: null },
      ],
    },
  },

  // Type-aware rules, scoped to the app source (covered by the tsconfigs).
  // Only the project parser is enabled here (not the full type-checked preset),
  // so we add exactly the typed rules we want rather than the whole recommended
  // set.
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.web.json'],
        tsconfigRootDir,
      },
    },
    rules: {
      '@typescript-eslint/restrict-plus-operands': 'error',
    },
  },

  // Main process, preload bridge, and build/test configs run under Node.
  {
    files: [
      'src/main/**/*.ts',
      'src/preload/**/*.ts',
      'src/shared/**/*.ts',
      'scripts/**/*.mjs',
      '*.{ts,js,mjs}',
      'e2e/**/*.ts',
    ],
    languageOptions: { globals: { ...globals.node } },
  },

  // Renderer is browser code with React.
  {
    files: ['src/renderer/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    languageOptions: { globals: { ...globals.browser } },
    rules: { ...reactHooks.configs.recommended.rules },
  },

  // Configs, scripts and e2e specs aren't in a tsconfig — keep them syntactic.
  {
    files: ['*.{ts,js,mjs}', 'scripts/**/*.mjs', 'e2e/**/*.ts'],
    extends: [tseslint.configs.disableTypeChecked],
  },
);

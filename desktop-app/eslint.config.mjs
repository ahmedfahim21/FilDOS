import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

/**
 * Flat ESLint config. The codebase splits cleanly along the Electron process
 * boundary, so lint env follows suit: node globals for main/preload/configs,
 * browser globals (+ React Hooks rules) for the renderer.
 */
export default tseslint.config(
  { ignores: ['out/**', 'dist/**', 'node_modules/**', 'test-results/**', 'playwright-report/**'] },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    rules: {
      // Allow intentional throwaways prefixed with underscore.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
      ],
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
);

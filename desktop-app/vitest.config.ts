import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

/**
 * Test runner config. Tests reuse the same path aliases as the app
 * (`@shared`, `@`). Renderer tests run under jsdom (they touch `window`);
 * everything else — chiefly the main-process FS service — runs under node.
 */
export default defineConfig({
  resolve: {
    // Resolve from the project root (cwd), matching electron.vite.config.ts —
    // avoids relying on __dirname, which isn't defined when the config is ESM.
    alias: {
      '@shared': resolve('src/shared'),
      '@': resolve('src/renderer/src'),
    },
  },
  test: {
    globals: true,
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    environment: 'node',
    environmentMatchGlobs: [['src/renderer/**', 'jsdom']],
  },
});

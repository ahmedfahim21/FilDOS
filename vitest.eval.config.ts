import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

/**
 * Separate Vitest config for the recall@k eval harness.
 * Run with: npm run eval
 *
 * Intentionally excluded from npm test so CI stays fast. The eval harness
 * uses bag-of-words embeddings by default (no model download required), but
 * results improve significantly with real models — see eval/recall.eval.ts.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@shared': resolve('src/shared'),
      '@': resolve('src/renderer/src'),
    },
  },
  test: {
    globals: true,
    include: ['eval/**/*.eval.ts'],
    environment: 'node',
    reporters: ['verbose'],
  },
});

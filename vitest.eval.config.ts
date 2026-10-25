import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

/**
 * Vitest config for the eval suites (`eval/*.eval.ts`): search, index, graph
 * and chat quality over the generated testbed. Run with `npm run eval` (real
 * models) or `npm run eval:smoke` (`--mode smoke`: bag-of-words embeddings, no
 * model downloads — what CI runs).
 * Excluded from `npm test`. See eval/README.md.
 */
export default defineConfig(({ mode }) => ({
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
    // Suites load models and index the testbed; one at a time keeps memory sane.
    fileParallelism: false,
    env: mode === 'smoke' ? { FILDOS_EVAL_PROVIDER: 'bow' } : {},
  },
}));

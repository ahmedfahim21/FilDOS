import { resolve } from 'node:path';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { config as loadDotenv } from 'dotenv';

// Populate process.env from a local `.env` so production builds on a dev machine
// bake in the same credentials dev uses. CI passes them as real env (secrets),
// which `dotenv` leaves untouched. Missing `.env` is a no-op.
loadDotenv();

/**
 * Cloud OAuth client credentials inlined into the main bundle at build time.
 * A packaged app has no `.env` next to the binary, so `process.env.*` reads in
 * the main process would come back empty for end users; these `define` tokens
 * bake the values in. See `src/main/cloud/credentials.ts` (runtime env still
 * wins for local dev). Values are '' unless set in the build environment.
 */
const cloudCredentialDefine = Object.fromEntries(
  ['GDRIVE', 'DROPBOX'].flatMap((provider) =>
    ['CLIENT_ID', 'CLIENT_SECRET'].map((kind) => [
      `__CLOUD_${provider}_${kind}__`,
      JSON.stringify(process.env[`${provider}_${kind}`] ?? ''),
    ]),
  ),
);

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    define: cloudCredentialDefine,
    build: {
      rollupOptions: {
        // Two main entries: the app and the standalone AI utilityProcess worker.
        input: {
          index: resolve('src/main/index.ts'),
          modelWorker: resolve('src/main/ai/modelWorker.ts'),
          llmWorker: resolve('src/main/ai/llm/llmWorker.ts'),
        },
      },
    },
    resolve: {
      alias: { '@shared': resolve('src/shared') },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: { '@shared': resolve('src/shared') },
    },
  },
  renderer: {
    root: 'src/renderer',
    build: {
      rollupOptions: {
        input: { index: resolve('src/renderer/index.html') },
      },
    },
    resolve: {
      alias: {
        '@shared': resolve('src/shared'),
        '@': resolve('src/renderer/src'),
      },
    },
    plugins: [react(), tailwindcss()],
  },
});

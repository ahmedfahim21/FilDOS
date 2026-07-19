import { createRequire } from 'node:module';
import { cpSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import type { Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { config as loadDotenv } from 'dotenv';

const require = createRequire(import.meta.url);

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

/**
 * Copy onnxruntime-web's `.wasm` binaries beside the built main output so the
 * embedded AI worker can load them offline. The worker sets `wasmPaths` to its
 * own __dirname (out/main), so the files must land there.
 */
function copyOnnxWasm(): Plugin {
  return {
    name: 'copy-onnx-wasm',
    apply: 'build',
    closeBundle() {
      let distDir: string;
      try {
        distDir = dirname(require.resolve('onnxruntime-web'));
      } catch {
        return; // onnxruntime-web (via @huggingface/transformers) not installed yet
      }
      const outDir = resolve('out/main');
      mkdirSync(outDir, { recursive: true });
      for (const file of readdirSync(distDir)) {
        if (file.endsWith('.wasm')) cpSync(join(distDir, file), join(outDir, file));
      }
    },
  };
}

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin(), copyOnnxWasm()],
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

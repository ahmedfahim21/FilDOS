import { createRequire } from 'node:module';
import { cpSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import type { Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const require = createRequire(import.meta.url);

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
    build: {
      rollupOptions: {
        // Two main entries: the app and the standalone AI utilityProcess worker.
        input: {
          index: resolve('src/main/index.ts'),
          modelWorker: resolve('src/main/ai/modelWorker.ts'),
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

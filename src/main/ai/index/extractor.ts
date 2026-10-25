import { utilityProcess } from 'electron';
import { setPriority } from 'node:os';
import { join } from 'node:path';
import { ExtractClient, type ExtractWorker } from './extractClient';

/** Heap cap for the extraction worker: a parse past it kills the worker, not the app. */
const EXTRACT_HEAP_MB = 1024;

/**
 * File text is read in its own utilityProcess (pdfjs/mammoth parse untrusted
 * files), behind `ExtractClient`'s time limit and restart. Shared by indexing, chat, Find similar and Quick Look.
 */
export const extractor = new ExtractClient(() => {
  const worker = utilityProcess.fork(join(__dirname, 'extractWorker.js'), [], {
    serviceName: 'fildos-extract',
    execArgv: [`--max-old-space-size=${EXTRACT_HEAP_MB}`],
  });
  // Background work: below normal priority, like the embedding worker.
  worker.on('spawn', () => {
    try {
      if (worker.pid) setPriority(worker.pid, 10);
    } catch (err) {
      console.info('[fildos] could not lower the extraction worker priority:', String(err));
    }
  });
  return worker as unknown as ExtractWorker;
});

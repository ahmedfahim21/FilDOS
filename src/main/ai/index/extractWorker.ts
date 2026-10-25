/**
 * Entry point of the extraction utilityProcess: reads file text (pdfjs,
 * mammoth, plain text) away from the main process. `extractClient.ts` is its
 * watchdog — time limit, heap cap, restart.
 */
import { extractPdfPages, extractText } from './extract';
import type { ExtractReply, ExtractRequest } from './extractClient';

/**
 * pdfjs decides once, as it loads, whether it runs under Node — and counts any
 * Electron process but the main one as a browser, which skips its Node
 * polyfills (DOMMatrix…) and fails. Load it presenting as the main process,
 * then put `process.type` back.
 */
const pdfjsReady = (async () => {
  const type = Object.getOwnPropertyDescriptor(process, 'type');
  Object.defineProperty(process, 'type', { value: 'browser', configurable: true });
  try {
    await import('pdfjs-dist/legacy/build/pdf.mjs');
  } finally {
    if (type) Object.defineProperty(process, 'type', type);
  }
})();

async function run(req: ExtractRequest): Promise<unknown> {
  await pdfjsReady;
  return req.op === 'text' ? extractText(req.path) : extractPdfPages(req.path, req.from, req.to);
}

process.parentPort.on('message', (e: { data: ExtractRequest & { id: number } }) => {
  const { id, ...req } = e.data;
  run(req)
    .then((data) => process.parentPort.postMessage({ id, ok: true, data } satisfies ExtractReply))
    .catch((err: NodeJS.ErrnoException) =>
      process.parentPort.postMessage({
        id,
        ok: false,
        error: { code: err.code ?? 'EEXTRACT', message: err.message },
      } satisfies ExtractReply),
    );
});

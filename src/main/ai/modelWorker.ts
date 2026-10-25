/**
 * Entry point of the embedding utilityProcess: binds `modelRuntime` to
 * `process.parentPort`. All model logic lives in the runtime, which the eval
 * harness also runs in-process.
 */
import { handle, setPost, type RuntimeRequest } from './modelRuntime';

function post(message: unknown): void {
  process.parentPort.postMessage(message);
}

setPost(post);

process.parentPort.on('message', (e: { data: RuntimeRequest & { id: number } }) => {
  const { id, ...req } = e.data;
  handle(req as RuntimeRequest)
    .then((data) => post({ id, ok: true, data }))
    .catch((err: NodeJS.ErrnoException) =>
      post({ id, ok: false, error: { code: err.code ?? 'EAIFAILED', message: err.message } }),
    );
});

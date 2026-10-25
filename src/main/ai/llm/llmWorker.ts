/**
 * Entry point of the chat LLM utilityProcess: binds `llmRuntime` to
 * `process.parentPort`. All model logic lives in the runtime, which the eval
 * harness also runs in-process.
 */
import { handle, resolveTool, setPost, type InMessage, type ToolResultMessage } from './llmRuntime';

function post(message: unknown): void {
  process.parentPort.postMessage(message);
}

setPost(post);

process.parentPort.on('message', (e: { data: InMessage | ToolResultMessage }) => {
  // Tool results answer a call we made — not a request; route and return.
  if (e.data.type === 'toolResult') {
    resolveTool(e.data.callId, e.data.result);
    return;
  }
  const { id } = e.data;
  handle(e.data)
    .then((data) => post({ id, ok: true, data }))
    .catch((err: NodeJS.ErrnoException) =>
      post({ id, ok: false, error: { code: err.code ?? 'ELLMFAILED', message: err.message } }),
    );
});

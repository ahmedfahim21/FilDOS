/**
 * Entry point of the embedding utilityProcess: binds `modelRuntime` to
 * `process.parentPort`. All model logic lives in the runtime, which the eval
 * harness also runs in-process.
 */
import type { EmbedRole } from '@shared/aiModels';
import { handle, setPost } from './modelRuntime';

function post(message: unknown): void {
  process.parentPort.postMessage(message);
}

setPost(post);

process.parentPort.on(
  'message',
  (e: {
    data: {
      id: number;
      type: string;
      modelId: string;
      texts?: string[];
      paths?: string[];
      role?: EmbedRole;
      query?: string;
      passages?: string[];
    };
  }) => {
    const { id, type, modelId, texts, paths, role, query, passages } = e.data;
    handle(type, modelId, texts, paths, role, query, passages)
      .then((data) => post({ id, ok: true, data }))
      .catch((err: NodeJS.ErrnoException) =>
        post({ id, ok: false, error: { code: err.code ?? 'EAIFAILED', message: err.message } }),
      );
  },
);

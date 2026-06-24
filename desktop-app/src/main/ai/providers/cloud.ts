import type { AiModelStatus } from '@shared/types';
import type { AiProvider } from './types';

/**
 * Hosted-AI provider stub — the deferred seam. A future version will embed (and
 * generate) via a remote API; for now every operation throws `EUNSUPPORTED`, so
 * the IPC handler surfaces a friendly "not supported yet" toast. Keeping the
 * stub registered means the Settings provider selector and the dispatch path are
 * exercised end-to-end before any hosted code exists.
 */
function notSupported(): NodeJS.ErrnoException {
  const err = new Error('Hosted AI is not available yet.') as NodeJS.ErrnoException;
  err.code = 'EUNSUPPORTED';
  return err;
}

export class CloudAiProvider implements AiProvider {
  readonly id = 'cloud';
  readonly capabilities = { embed: false, generate: false, images: false };

  async status(modelId: string): Promise<AiModelStatus> {
    return { state: 'absent', modelId, dim: 0 };
  }

  async download(): Promise<void> {
    throw notSupported();
  }

  async embed(): Promise<Float32Array[]> {
    throw notSupported();
  }

  async embedImages(): Promise<Float32Array[]> {
    throw notSupported();
  }

  async generate(): Promise<string> {
    throw notSupported();
  }
}

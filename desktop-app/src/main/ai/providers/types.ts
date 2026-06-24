/**
 * The AI provider contract. Mirrors the cloud provider seam (`src/main/cloud/`):
 * a small interface that concrete integrations implement, dispatched through a
 * runtime registry. The first provider is on-device (`embedded`); a hosted
 * provider (`cloud`) is a deliberately deferred stub.
 *
 * A provider serves the whole model catalog (`@shared/aiModels`), so every call
 * names the model to use. Methods throw on failure — the IPC handler converts
 * thrown errors into the `Result<T>` discriminated union, like the FS handlers.
 */
import type { AiModelStatus } from '@shared/types';

export type { AiModelState, AiModelStatus } from '@shared/types';

export interface AiProvider {
  /** Registry key (e.g. 'embedded', 'cloud'). */
  readonly id: string;
  /** What this provider can do; gates UI affordances. */
  readonly capabilities: { embed: boolean; generate: boolean; images: boolean };

  /** State of one model (absent / downloading / ready / error). */
  status(modelId: string): Promise<AiModelStatus>;
  /** Ensure a model is present locally. Idempotent; emits progress while fetching. */
  download(modelId: string): Promise<void>;
  /** Embed each input string into a vector; one Float32Array per input. */
  embed(modelId: string, texts: string[]): Promise<Float32Array[]>;
  /** Embed each image file (by path) into a vector; image-capable models only. */
  embedImages(modelId: string, paths: string[]): Promise<Float32Array[]>;
  /** Optional text generation (not used by the foundation; future hosted seam). */
  generate?(prompt: string): Promise<string>;
  /** Optional subscription to download/state progress; returns an unsubscribe fn. */
  onProgress?(cb: (status: AiModelStatus) => void): () => void;
}

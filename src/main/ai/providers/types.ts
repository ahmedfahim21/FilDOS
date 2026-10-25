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
import type { AiModelStatus, DecodedInput } from '@shared/types';
import type { EmbedRole } from '@shared/aiModels';
import type { EntitySpan } from '@shared/graphTypes';

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
  /** Abort an in-flight download for a model, if one is running. */
  cancelDownload?(modelId: string): Promise<void>;
  /** Embed each input string into a vector; one Float32Array per input. The
   * `role` picks the task prefix (query, question or passage); `titles` (one per
   * passage, usually the file name) title the documents. */
  embed(modelId: string, texts: string[], role?: EmbedRole, titles?: string[]): Promise<Float32Array[]>;
  /** Embed media files by path, one vector each, into the same space as text.
   * `budget` is the vision soft-token budget per picture (70–1120). */
  embedMedia(modelId: string, kind: 'image', paths: string[], opts?: { budget?: number }): Promise<Float32Array[]>;
  /** Embed decoded media (video frames, audio windows) — one kind per call — one vector each. */
  embedDecoded(modelId: string, inputs: DecodedInput[]): Promise<Float32Array[]>;
  /**
   * Count tokens for each text using the model's own tokenizer. One IPC call,
   * no inference — used by the indexer to calibrate chunk window size so dense
   * code or non-Latin text never silently exceeds the model's token limit.
   */
  countTokens?(modelId: string, texts: string[]): Promise<number[]>;
  /**
   * Named-entity recognition: one EntitySpan[] per input text (people, orgs,
   * places for the knowledge graph). Callers must
   * check `provider.status(modelId)` first so a build never triggers a download.
   */
  extractEntities?(modelId: string, texts: string[]): Promise<EntitySpan[][]>;
  /** Optional text generation (not used by the foundation; future hosted seam). */
  generate?(prompt: string): Promise<string>;
  /** Optional subscription to download/state progress; returns an unsubscribe fn. */
  onProgress?(cb: (status: AiModelStatus) => void): () => void;
}

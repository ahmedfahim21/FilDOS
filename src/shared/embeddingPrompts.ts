/**
 * EmbeddingGemma 2's task prefixes — the one place they're written. The model
 * is trained with them: queries and documents get different instructions, and
 * documents carry a title. Prefixes apply to text only; pictures, audio and
 * video are embedded as they are.
 *
 * Changing anything here changes every stored vector: bump PROMPTS_VERSION so
 * the index fingerprint changes and the index is rebuilt.
 */
import type { EmbedRole } from './aiModels';

export const PROMPTS_VERSION = 1;

/** A search query, or a question asked of the files. */
export function queryText(text: string, role: Exclude<EmbedRole, 'passage'> = 'query'): string {
  const task = role === 'question' ? 'question answering' : 'search result';
  return `task: ${task} | query: ${text}`;
}

/** Document content, titled by its file name (`none` when there is no title). */
export function documentText(text: string, title?: string): string {
  const t = title?.trim() ? title.trim().replace(/\s+/g, ' ') : 'none';
  return `title: ${t} | text: ${text}`;
}

/** The text actually embedded for a role (titles apply to passages only). */
export function promptedText(text: string, role: EmbedRole, title?: string): string {
  return role === 'passage' ? documentText(text, title) : queryText(text, role);
}

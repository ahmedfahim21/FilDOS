import { isRemote } from '@shared/remote';
import type { ChatSendPayload, Entry, SemanticHit } from '@shared/types';

/**
 * Turns a chat message (text + @file/#folder mentions + optional /command) into
 * the system prompt and final prompt handed to the local model. Dependencies
 * are injected (like Indexer) so tests drive it with fakes — no Electron, no
 * real index.
 *
 * Budgets are sized for the small models in `@shared/llmModels` (4k-token
 * contexts ≈ 16k chars): mentioned content gets ~9k chars split across the
 * mentions, folder listings are capped per folder, and history is capped by
 * the caller. Oversized content is truncated, never rejected — a partial
 * answer beats an error.
 */

export interface ChatContextDeps {
  /** Extract a file's text (null when binary/unsupported) — extract.ts in prod. */
  extract(path: string): Promise<string | null>;
  /** List a folder — fs/service.listDir in prod. */
  list(path: string): Promise<Entry[]>;
  /** Semantic search over the index — only needed for /find. */
  search?(query: string, k: number): Promise<SemanticHit[]>;
}

export interface BuiltChat {
  system: string;
  /** `material` and `question` joined — the whole message as the model would see it untrimmed. */
  prompt: string;
  /** File contents, folder listings and search results — the worker trims this to the window. */
  material: string;
  /** The command's instruction and the user's words — never trimmed. */
  question: string;
  /** Semantic hits backing a /find answer, for the UI's source chips. */
  hits?: SemanticHit[];
}

/** Total character budget for mentioned file content across one message. */
export const CONTENT_BUDGET = 9_000;
/** Most entries shown per folder listing. */
export const MAX_FOLDER_ENTRIES = 100;
/** Hits fetched for /find. */
export const FIND_HITS = 8;

/**
 * The maximized research page runs with a wider context window (see
 * handlers.ts), so it can afford larger budgets — more file content, more
 * folder entries, and more /find hits per turn.
 */
export const RESEARCH_BUDGETS = {
  content: 24_000,
  folderEntries: 200,
  findHits: 16,
} as const;

/**
 * Characters of file content per token of context window gathered up front:
 * at most half the window's worth (~4 chars/token). It's a coarse pre-trim so
 * a small window never receives a book; the worker then fits the turn exactly
 * with the model's tokenizer (`fitTurn.ts`).
 */
const CONTENT_CHARS_PER_WINDOW_TOKEN = 2;
/** Content is never pre-trimmed below this, however small the window. */
const MIN_CONTENT_CHARS = 1_500;

/** Per-message budgets, widened for research and scaled to the context window. */
export function budgetsFor(mode: ChatSendPayload['mode'], contextTokens?: number) {
  const base =
    mode === 'research'
      ? { content: RESEARCH_BUDGETS.content, folderEntries: RESEARCH_BUDGETS.folderEntries, findHits: RESEARCH_BUDGETS.findHits }
      : { content: CONTENT_BUDGET, folderEntries: MAX_FOLDER_ENTRIES, findHits: FIND_HITS };
  if (!contextTokens) return base;
  const cap = Math.max(MIN_CONTENT_CHARS, contextTokens * CONTENT_CHARS_PER_WINDOW_TOKEN);
  return { ...base, content: Math.min(base.content, cap) };
}

const SYSTEM_PROMPT = [
  'You are the FilDOS Assistant, built into the FilDOS file browser.',
  'You answer questions about the user\'s files using only the file content, folder listings and search results provided in the message.',
  'Refer to files by their file names. Be concise and direct.',
  'If the provided material is not enough to answer, say so plainly instead of guessing.',
].join(' ');

const COMMAND_INSTRUCTIONS: Record<string, string> = {
  summarize:
    'Summarize the material above. Lead with a one-sentence gist, then the key points.',
  explain:
    'Explain the material above: what each file is, what it contains, and what it appears to be for.',
  compare:
    'Compare the files above: their purpose, their contents, and the notable differences between them.',
  find:
    'The user is trying to find a file. The search results above are the closest matches from their indexed files, best first. Point to the most likely file or files by name and say why each matches. If none look right, say so.',
};

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[i]}`;
}

function fmtDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** One mentioned file rendered as a context block, truncated to its budget. */
async function fileBlock(deps: ChatContextDeps, path: string, name: string, budget: number): Promise<string> {
  if (isRemote(path)) {
    return `File: ${name} (${path})\n[Cloud file — its content is not available to the assistant yet.]`;
  }
  const text = await deps.extract(path).catch(() => null);
  if (text === null) {
    return `File: ${name} (${path})\n[Content not readable as text — binary or unsupported format.]`;
  }
  const trimmed = text.length > budget ? `${text.slice(0, budget)}\n[…truncated]` : text;
  return `File: ${name} (${path})\n---\n${trimmed}\n---`;
}

/** One mentioned folder rendered as a listing block. */
async function folderBlock(
  deps: ChatContextDeps,
  path: string,
  name: string,
  maxEntries: number,
): Promise<string> {
  let entries: Entry[];
  try {
    entries = await deps.list(path);
  } catch {
    return `Folder: ${name} (${path})\n[Could not be read.]`;
  }
  const visible = entries.filter((e) => !e.isHidden);
  const lines = visible.slice(0, maxEntries).map((e) =>
    e.isDirectory
      ? `- ${e.name}/ (folder)`
      : `- ${e.name} — ${fmtSize(e.size)}, modified ${fmtDate(e.modified)}`,
  );
  if (visible.length > maxEntries) {
    lines.push(`…and ${visible.length - maxEntries} more entries`);
  }
  return `Folder: ${name} (${path}) — ${visible.length} entries\n${lines.join('\n')}`;
}

/** Shortest passage per hit, however many hits share the budget. */
const MIN_PASSAGE_CHARS = 300;

/**
 * The /find hits as context: each hit's matched passage (where in the file the
 * answer is, page included), sharing the content budget.
 */
function hitsBlock(hits: SemanticHit[], budget: number): string {
  if (!hits.length) return 'Search results: none — nothing in the index matched.';
  const per = Math.max(MIN_PASSAGE_CHARS, Math.floor(budget / hits.length));
  const lines = hits.map((h, i) => {
    const where = h.segment === 'page' && h.loc ? `, page ${h.loc}` : '';
    const text = (h.passage || h.snippet).replace(/[«»]/g, '').replace(/\s+/g, ' ').slice(0, per);
    return `${i + 1}. ${h.name} (${h.path}${where})\n   "${text}"`;
  });
  return `Search results (best first):\n${lines.join('\n')}`;
}

/** Build the system + prompt (and /find hits) for one chat message.
 *  `contextTokens` (the model's resolved window) clamps the content budget so
 *  the whole turn fits — pass it from the handler's resolved config. */
export async function buildChat(
  payload: ChatSendPayload,
  deps: ChatContextDeps,
  opts: { contextTokens?: number } = {},
): Promise<BuiltChat> {
  const { command, cwd } = payload;
  const prompt = payload.prompt.trim();
  const budgets = budgetsFor(payload.mode, opts.contextTokens);
  const blocks: string[] = [];
  let hits: SemanticHit[] | undefined;

  // /find is search-first: the hits are the context.
  if (command === 'find') {
    if (!deps.search) {
      throw Object.assign(
        new Error('Semantic search is not available — enable AI indexing in Settings first.'),
        { code: 'EUNSUPPORTED' },
      );
    }
    hits = await deps.search(prompt, budgets.findHits);
    blocks.push(hitsBlock(hits, budgets.content));
  }

  // Mentioned folders first (cheap listings), then files sharing the budget.
  const folders = payload.mentions.filter((m) => m.kind === 'folder');
  const files = payload.mentions.filter((m) => m.kind === 'file');
  for (const f of folders) blocks.push(await folderBlock(deps, f.path, f.name, budgets.folderEntries));
  const perFile = Math.floor(budgets.content / Math.max(1, files.length));
  for (const f of files) blocks.push(await fileBlock(deps, f.path, f.name, perFile));

  // A subject-taking command with nothing mentioned falls back to the current folder.
  if (command && command !== 'find' && !payload.mentions.length && cwd) {
    blocks.push(await folderBlock(deps, cwd, cwd.split(/[\\/]/).pop() || cwd, budgets.folderEntries));
  }

  const instruction = command ? COMMAND_INSTRUCTIONS[command] : undefined;
  const asked: string[] = [];
  if (instruction) asked.push(instruction);
  if (prompt || !instruction) asked.push(prompt);
  const material = blocks.join('\n\n');
  const question = asked.join('\n\n');

  return { system: SYSTEM_PROMPT, prompt: [material, question].filter(Boolean).join('\n\n'), material, question, hits };
}

/** Appended to the system prompt when the file tools are available. */
export const TOOLS_SYSTEM = [
  'You can also act on the user\'s files with the provided functions: create files and folders, copy, move, rename, delete (to the OS Trash), list folders, read files, and search the index.',
  'Only call an action that changes files (create/copy/move/rename/delete) when the user clearly asks for it — never delete, move, or modify anything they did not ask about.',
  'To research or answer questions about the user\'s files, use search_index to find relevant files, then read_file to read them; you may search several times to gather what you need before answering.',
  'Prefer paths from the message or the current folder. After acting, briefly confirm what you did, naming the files.',
].join(' ');

/**
 * The full system prompt for a tool-enabled turn: the built context, the tool
 * guidance, the open folder, and the user's standing instructions.
 */
export function assembleSystem(built: BuiltChat, opts: { cwd?: string; instructions?: string } = {}): string {
  let system = `${built.system} ${TOOLS_SYSTEM}`;
  if (opts.cwd) system += `\nThe folder currently open in the browser: ${opts.cwd}`;
  if (opts.instructions) system += `\n\nAdditional instructions from the user: ${opts.instructions}`;
  return system;
}

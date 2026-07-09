import { promises as fs } from 'node:fs';
import { basename, isAbsolute, join, normalize } from 'node:path';
import type { ChatToolCall, SemanticHit } from '@shared/types';
import {
  createFolder,
  copy,
  getInfo,
  listDir,
  move,
  rename,
  uniqueDestination,
} from '../../fs/service';

/**
 * Executes the Assistant's file tools (`@shared/chatTools`) in the main
 * process. The LLM worker never touches the disk: its function handlers RPC
 * here, this module performs the action through fs/service, and the outcome
 * goes back to the model (so it can confirm or recover) and to the renderer
 * (as an activity chip).
 *
 * Every action is recoverable by design — deletes go to the OS Trash,
 * creations/copies auto-rename instead of overwriting — and a failed tool
 * resolves to `ok: false` rather than throwing, so generation never crashes
 * on a bad path. Environment side effects (Trash, DB remap, extraction) are
 * injected so tests can run against a plain temp dir.
 */

export interface ChatToolDeps {
  /** shell.trashItem in prod. */
  trashItem(path: string): Promise<void>;
  /** Carry tags/recents/index rows along after rename/move (db/remap). */
  remap(oldPath: string, newPath: string): void;
  /** Drop AI-index rows for a deleted path (mirrors the fs trash handler). */
  dropIndex(path: string): Promise<void>;
  /** Extract a file's text (index/extract.extractText in prod). */
  extract(path: string): Promise<string | null>;
  /** Semantic + keyword search over the AI index (index/handlers.searchIndex). */
  search(query: string, k: number): Promise<SemanticHit[]>;
  /** The user's home directory, for `~` expansion. */
  home(): string;
}

/** Longest file excerpt handed back to the model (context stays bounded). */
export const READ_CAP = 4_000;
/** Most entries returned by list_folder. */
export const LIST_CAP = 50;

interface ToolOutcome {
  /** What the renderer shows and the DB stores. */
  call: ChatToolCall;
  /** What the model receives as the function result. */
  result: unknown;
}

function fail(name: string, message: string): ToolOutcome {
  return {
    call: { name, summary: message, ok: false },
    result: { ok: false, error: message },
  };
}

/** Errno → friendly phrase for tool summaries (subset of fs/handlers' map). */
function friendly(err: unknown): string {
  const e = err as NodeJS.ErrnoException;
  const messages: Record<string, string> = {
    EACCES: 'permission denied',
    EPERM: 'operation not permitted',
    ENOENT: 'it no longer exists',
    EEXIST: 'that name is already taken',
    ENOTDIR: 'that path is not a folder',
    EISDIR: 'that path is a folder',
    EINVAL: 'invalid input',
  };
  return messages[e?.code ?? ''] ?? e?.message ?? 'something went wrong';
}

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);
const strArray = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && !!x.trim()) : [];

/** "3 items" / the base name when there's exactly one. */
function describe(paths: string[]): string {
  return paths.length === 1 ? `"${basename(paths[0])}"` : `${paths.length} items`;
}

export class ChatToolError extends Error {}

/**
 * Resolve a model-provided path: expand `~`, resolve relative paths against
 * the current folder, and require the result to be absolute. The model's
 * paths are untrusted input — but so is every path in a file manager; the
 * only hard rejections are the malformed ones.
 */
function resolveToolPath(input: unknown, cwd: string | undefined, home: string): string {
  const raw = str(input);
  if (!raw || raw.includes('\0')) throw new ChatToolError('No valid path given.');
  let p = raw;
  if (p === '~' || p.startsWith('~/') || p.startsWith('~\\')) p = join(home, p.slice(1));
  if (!isAbsolute(p)) {
    if (!cwd) throw new ChatToolError(`"${raw}" is relative but no folder is open.`);
    p = join(cwd, p);
  }
  return normalize(p);
}

/** Run one named tool. Resolves (never rejects) with the outcome. */
export async function executeChatTool(
  name: string,
  params: Record<string, unknown>,
  cwd: string | undefined,
  deps: ChatToolDeps,
): Promise<ToolOutcome> {
  try {
    return await run(name, params, cwd, deps);
  } catch (err) {
    if (err instanceof ChatToolError) return fail(name, err.message);
    return fail(name, `Couldn't ${name.replace(/_/g, ' ')} — ${friendly(err)}.`);
  }
}

async function run(
  name: string,
  params: Record<string, unknown>,
  cwd: string | undefined,
  deps: ChatToolDeps,
): Promise<ToolOutcome> {
  const folderOf = (key: string) =>
    params[key] == null ? resolveToolPath(cwd, undefined, deps.home()) : resolveToolPath(params[key], cwd, deps.home());

  switch (name) {
    case 'create_file': {
      const fileName = str(params.name);
      if (!fileName) throw new ChatToolError('No file name given.');
      const dir = folderOf('folder');
      const dest = await uniqueDestination(dir, basename(fileName));
      await fs.writeFile(dest, typeof params.content === 'string' ? params.content : '', {
        flag: 'wx',
      });
      return {
        call: { name, summary: `Created "${basename(dest)}"`, ok: true, paths: [dest] },
        result: { ok: true, path: dest },
      };
    }

    case 'create_folder': {
      const folderName = str(params.name);
      if (!folderName) throw new ChatToolError('No folder name given.');
      const entry = await createFolder(folderOf('folder'), folderName);
      return {
        call: { name, summary: `Created folder "${entry.name}"`, ok: true, paths: [entry.path] },
        result: { ok: true, path: entry.path },
      };
    }

    case 'copy_files': {
      const sources = strArray(params.paths).map((p) => resolveToolPath(p, cwd, deps.home()));
      if (!sources.length) throw new ChatToolError('No files given to copy.');
      const dest = resolveToolPath(params.destination, cwd, deps.home());
      const copied = await copy(sources, dest);
      return {
        call: {
          name,
          summary: `Copied ${describe(sources)} to "${basename(dest)}"`,
          ok: true,
          paths: copied.map((e) => e.path),
        },
        result: { ok: true, paths: copied.map((e) => e.path) },
      };
    }

    case 'move_files': {
      const sources = strArray(params.paths).map((p) => resolveToolPath(p, cwd, deps.home()));
      if (!sources.length) throw new ChatToolError('No files given to move.');
      const dest = resolveToolPath(params.destination, cwd, deps.home());
      const moved = await move(sources, dest);
      moved.forEach((entry, i) => deps.remap(sources[i], entry.path));
      return {
        call: {
          name,
          summary: `Moved ${describe(sources)} to "${basename(dest)}"`,
          ok: true,
          paths: moved.map((e) => e.path),
        },
        result: { ok: true, paths: moved.map((e) => e.path) },
      };
    }

    case 'rename_file': {
      const from = resolveToolPath(params.path, cwd, deps.home());
      const newName = str(params.new_name);
      if (!newName) throw new ChatToolError('No new name given.');
      const entry = await rename(from, newName);
      deps.remap(from, entry.path);
      return {
        call: {
          name,
          summary: `Renamed "${basename(from)}" to "${entry.name}"`,
          ok: true,
          paths: [entry.path],
        },
        result: { ok: true, path: entry.path },
      };
    }

    case 'delete_files': {
      const targets = strArray(params.paths).map((p) => resolveToolPath(p, cwd, deps.home()));
      if (!targets.length) throw new ChatToolError('No files given to delete.');
      for (const p of targets) {
        await deps.trashItem(p);
        await deps.dropIndex(p);
      }
      return {
        call: { name, summary: `Moved ${describe(targets)} to the Trash`, ok: true, paths: targets },
        result: { ok: true, trashed: targets },
      };
    }

    case 'list_folder': {
      const dir = folderOf('path');
      const entries = await listDir(dir);
      const visible = entries.filter((e) => !e.isHidden);
      return {
        call: { name, summary: `Listed "${basename(dir) || dir}"`, ok: true, paths: [dir] },
        result: {
          ok: true,
          entries: visible.slice(0, LIST_CAP).map((e) => ({
            name: e.name,
            kind: e.isDirectory ? 'folder' : 'file',
            size: e.size,
          })),
          ...(visible.length > LIST_CAP ? { more: visible.length - LIST_CAP } : {}),
        },
      };
    }

    case 'read_file': {
      const target = resolveToolPath(params.path, cwd, deps.home());
      await getInfo(target); // surfaces ENOENT with a friendly message
      const text = await deps.extract(target);
      if (text === null) return fail(name, `Couldn't read "${basename(target)}" — not a text file.`);
      return {
        call: { name, summary: `Read "${basename(target)}"`, ok: true, paths: [target] },
        result: {
          ok: true,
          content: text.length > READ_CAP ? `${text.slice(0, READ_CAP)}\n[…truncated]` : text,
        },
      };
    }

    case 'search_index': {
      const query = str(params.query);
      if (!query) throw new ChatToolError('No search query given.');
      const k =
        typeof params.k === 'number' && params.k > 0 ? Math.min(16, Math.floor(params.k)) : 8;
      const hits = await deps.search(query, k);
      return {
        call: {
          name,
          summary: hits.length
            ? `Searched "${query}" — ${hits.length} result${hits.length === 1 ? '' : 's'}`
            : `Searched "${query}" — no matches`,
          ok: true,
          paths: hits.map((h) => h.path),
        },
        result: {
          ok: true,
          results: hits.map((h) => ({
            name: h.name,
            path: h.path,
            snippet: h.snippet.replace(/\s+/g, ' ').slice(0, 200),
          })),
        },
      };
    }

    default:
      return fail(name, `Unknown tool "${name}".`);
  }
}

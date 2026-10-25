import { promises as fs } from 'node:fs';
import { basename, dirname, isAbsolute, join, normalize } from 'node:path';
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
/** Characters of each search_index hit's matched passage handed to the model. */
export const SEARCH_PASSAGE_CHARS = 600;


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

/**
 * A file or folder name the model asked for, cleaned of what it copies from
 * the sentence around it: surrounding quotes/backticks and trailing dots or
 * spaces ("Rename it to packing.md." → "packing.md"). Windows rejects trailing
 * dots anyway, and elsewhere they're never what the user meant.
 */
export function newName(value: unknown): string {
  return (str(value) ?? '')
    .trim()
    .replace(/^["'`“‘]+|["'`”’]+$/g, '')
    .replace(/[.\s]+$/, '');
}

/** "3 items" / the base name when there's exactly one. */
function describe(paths: string[]): string {
  return paths.length === 1 ? `"${basename(paths[0])}"` : `${paths.length} items`;
}

export class ChatToolError extends Error {}

/**
 * Directories that hold credentials/keys — never a legitimate document target,
 * and the prime goal of a prompt-injection attack (indexed content can steer
 * the model's next tool call). Blocked for every tool regardless of how the
 * path was formed, so a fabricated `~/.ssh/id_rsa` read can't leak into chat.
 */
const PROTECTED_DIRS = new Set([
  '.ssh',
  '.aws',
  '.gnupg',
  '.gpg',
  '.kube',
  '.docker',
  '.gcloud',
  '.password-store',
]);

/** Reject a resolved path that dips into a protected credential directory. */
function assertToolPathAllowed(resolved: string): void {
  const segments = resolved.split(/[\\/]+/);
  if (segments.some((s) => PROTECTED_DIRS.has(s.toLowerCase()))) {
    throw new ChatToolError('That location is protected and can’t be accessed.');
  }
}

/**
 * Resolve a model-provided path: expand `~`, resolve relative paths against
 * the current folder, and require the result to be absolute. The model's
 * paths are untrusted input — but so is every path in a file manager; we
 * reject malformed ones and block protected credential directories.
 */
export function resolveToolPath(input: unknown, cwd: string | undefined, home: string): string {
  const raw = str(input);
  if (!raw || raw.includes('\0')) throw new ChatToolError('No valid path given.');
  let p = raw;
  if (p === '~' || p.startsWith('~/') || p.startsWith('~\\')) p = join(home, p.slice(1));
  if (!isAbsolute(p)) {
    if (!cwd) throw new ChatToolError(`"${raw}" is relative but no folder is open.`);
    p = join(cwd, p);
  }
  const out = normalize(p);
  assertToolPathAllowed(out);
  return out;
}

/**
 * Resolve a path the model gave for something that should already exist. A
 * relative path is tried against the open folder first; when it names a
 * folder too ("Recipes/pasta.md", "Home/Travel/list.md") — the model often
 * writes paths from a parent or from home — also against each ancestor of the
 * open folder and then home, taking the first that exists. A bare name only
 * ever means the open folder, so nothing is guessed from elsewhere.
 */
export async function resolveExisting(input: unknown, cwd: string | undefined, home: string): Promise<string> {
  const direct = resolveToolPath(input, cwd, home);
  const raw = str(input)!;
  if (isAbsolute(raw) || raw.startsWith('~') || !cwd || !/[\\/]/.test(raw)) return direct;
  if (await exists(direct)) return direct;
  const bases: string[] = [];
  for (let dir = dirname(cwd); dir !== dirname(dir); dir = dirname(dir)) bases.push(dir);
  bases.push(home);
  for (const base of bases) {
    const candidate = resolveToolPath(raw, base, home);
    if (await exists(candidate)) return candidate;
  }
  return direct;
}

async function exists(path: string): Promise<boolean> {
  return fs.access(path).then(
    () => true,
    () => false,
  );
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
  const folderOf = async (key: string) =>
    params[key] == null ? resolveToolPath(cwd, undefined, deps.home()) : resolveExisting(params[key], cwd, deps.home());

  switch (name) {
    case 'create_file': {
      const fileName = newName(params.name);
      if (!fileName) throw new ChatToolError('No file name given.');
      const dir = await folderOf('folder');
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
      const folderName = newName(params.name);
      if (!folderName) throw new ChatToolError('No folder name given.');
      // basename() strips any path separators so a "../.." name can't escape
      // the parent folder (mirrors create_file's handling of `name`).
      const entry = await createFolder(await folderOf('folder'), basename(folderName));
      return {
        call: { name, summary: `Created folder "${entry.name}"`, ok: true, paths: [entry.path] },
        result: { ok: true, path: entry.path },
      };
    }

    case 'copy_files': {
      const sources = await Promise.all(strArray(params.paths).map((p) => resolveExisting(p, cwd, deps.home())));
      if (!sources.length) throw new ChatToolError('No files given to copy.');
      const dest = await resolveExisting(params.destination, cwd, deps.home());
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
      const sources = await Promise.all(strArray(params.paths).map((p) => resolveExisting(p, cwd, deps.home())));
      if (!sources.length) throw new ChatToolError('No files given to move.');
      const dest = await resolveExisting(params.destination, cwd, deps.home());
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
      const from = await resolveExisting(params.path, cwd, deps.home());
      const target = newName(params.new_name);
      if (!target) throw new ChatToolError('No new name given.');
      // Enforce the schema's "no path separators" promise so a rename can't
      // move the file elsewhere via `..` (mirrors create_file/create_folder).
      const entry = await rename(from, basename(target));
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
      const targets = await Promise.all(strArray(params.paths).map((p) => resolveExisting(p, cwd, deps.home())));
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
      const dir = await folderOf('path');
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
      const target = await resolveExisting(params.path, cwd, deps.home());
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
            ...(h.segment === 'page' && h.loc ? { page: h.loc } : {}),
            // The matched passage: what the model can quote and answer from.
            passage: (h.passage || h.snippet).replace(/[«»]/g, '').replace(/\s+/g, ' ').trim().slice(0, SEARCH_PASSAGE_CHARS),
          })),
        },
      };
    }

    default:
      return fail(name, `Unknown tool "${name}".`);
  }
}

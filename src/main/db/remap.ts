import { rawDb } from './connection';

/**
 * Rewrite every stored path under `oldPath` to live under `newPath` after a
 * rename/move — the entry itself plus, for folders, everything inside it.
 * Raw synchronous SQL: Drizzle has no UPDATE OR REPLACE (which resolves
 * primary-key collisions in favour of the moved rows), and running the three
 * updates synchronously keeps the transaction free of await points.
 */
export function remapPaths(oldPath: string, newPath: string, sep: string): void {
  if (oldPath === newPath) return;
  const d = rawDb();
  d.exec('BEGIN');
  try {
    // file_chunks is intentionally absent: its rows follow index_state via the
    // FK's ON UPDATE CASCADE when the path is rewritten below.
    for (const table of ['file_tags', 'recents', 'folder_views', 'index_state']) {
      d.prepare(
        `UPDATE OR REPLACE ${table}
         SET path = :new || substr(path, length(:old) + 1)
         WHERE path = :old OR substr(path, 1, length(:old) + 1) = :old || :sep`,
      ).run({ new: newPath, old: oldPath, sep });
    }
    // The renamed entry's display name must follow its new basename too.
    const base = newPath.slice(newPath.lastIndexOf(sep) + 1);
    if (base) d.prepare('UPDATE recents SET name = ? WHERE path = ?').run(base, newPath);
    d.exec('COMMIT');
  } catch (err) {
    d.exec('ROLLBACK');
    throw err;
  }
}

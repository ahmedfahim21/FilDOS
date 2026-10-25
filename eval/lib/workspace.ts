import { isAbsolute, relative } from 'node:path';
import { resolveExisting } from '../../src/main/ai/llm/tools';

/**
 * The chat eval's workspace boundary: every case runs in its own copy of the
 * testbed, and a tool call may only touch paths inside it.
 */

/** Path-valued tool params (see `@shared/chatTools`). */
const PATH_PARAMS = ['path', 'paths', 'destination', 'folder'];

/**
 * The first path in a tool call's params that, resolved exactly as the tools
 * resolve it (`resolveExisting`: trimmed, `~` → the case's home, relative → its
 * cwd, and a relative path with a folder in it also tried against each
 * ancestor, which can reach above `ws`), falls outside `ws` or is `ws` itself;
 * null when every path stays inside. A path the tool can't resolve at all is
 * left to the tool, which refuses it.
 */
export async function escapingPath(
  params: Record<string, unknown>,
  ws: string,
  cwd: string | undefined,
): Promise<string | null> {
  for (const key of PATH_PARAMS) {
    const v = params[key];
    for (const p of Array.isArray(v) ? v : [v]) {
      if (typeof p !== 'string') continue;
      let resolved: string;
      try {
        resolved = await resolveExisting(p, cwd, ws);
      } catch {
        continue; // the tool rejects it with its own error
      }
      const rel = relative(ws, resolved);
      if (rel === '' || rel.startsWith('..') || isAbsolute(rel)) return p;
    }
  }
  return null;
}

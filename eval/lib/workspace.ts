import { isAbsolute, relative } from 'node:path';
import { resolveToolPath } from '../../src/main/ai/llm/tools';

/**
 * The chat eval's workspace boundary: every case runs in its own copy of the
 * testbed, and a tool call may only touch paths inside it.
 */

/** Path-valued tool params (see `@shared/chatTools`). */
const PATH_PARAMS = ['path', 'paths', 'destination', 'folder'];

/**
 * The first path in a tool call's params that, resolved exactly as the tool
 * resolves it (trimmed, `~` → the case's home, relative → its cwd), falls
 * outside `ws` or is `ws` itself; null when every path stays inside. A path
 * the tool can't resolve at all is left to the tool, which refuses it.
 */
export function escapingPath(params: Record<string, unknown>, ws: string, cwd: string | undefined): string | null {
  for (const key of PATH_PARAMS) {
    const v = params[key];
    for (const p of Array.isArray(v) ? v : [v]) {
      if (typeof p !== 'string') continue;
      let resolved: string;
      try {
        resolved = resolveToolPath(p, cwd, ws);
      } catch {
        continue; // the tool rejects it with its own error
      }
      const rel = relative(ws, resolved);
      if (rel === '' || rel.startsWith('..') || isAbsolute(rel)) return p;
    }
  }
  return null;
}

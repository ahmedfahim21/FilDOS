import type { MemoryBackend } from './types';
import { getPrefs } from '../../prefs';

/**
 * Global memory-backend registry. Each backend registers once at startup;
 * handlers dispatch through `activeMemoryBackend`, which honours the user's
 * choice in `prefs.ai.activeBackend`. Mirrors the AI provider registry
 * (`ai/registry.ts`).
 *
 * Example (in main/index.ts / index handlers):
 *   registerMemoryBackend(new LocalBackend({ ... }));
 *   registerMemoryBackend(new SupermemoryBackend({ ... }));
 */

const registry = new Map<string, MemoryBackend>();

/** Register a backend under its id (e.g. 'local'). */
export function registerMemoryBackend(backend: MemoryBackend): void {
  registry.set(backend.id, backend);
}

/** Look up a registered backend. Returns null if the id is unknown. */
export function getMemoryBackend(backendId: string): MemoryBackend | null {
  return registry.get(backendId) ?? null;
}

/** Identifiers of all currently registered backends. */
export function registeredMemoryBackends(): string[] {
  return [...registry.keys()];
}

/** The backend selected in prefs (defaults to 'local'). Throws if unregistered. */
export async function activeMemoryBackend(): Promise<MemoryBackend> {
  const prefs = await getPrefs();
  const id = prefs.ai?.activeBackend ?? 'local';
  const backend = getMemoryBackend(id);
  if (!backend) {
    throw Object.assign(new Error(`Memory backend '${id}' is not configured.`), { code: 'EINVAL' });
  }
  return backend;
}

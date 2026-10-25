import type { IndexConfig, Prefs } from '@shared/types';

/**
 * The `prefs.index` value after a config change. `prefs.index` holds more than
 * the user-facing `IndexConfig` (e.g. the index fingerprint), and prefs are
 * written whole per key, so the stored object is the base: dropping a field
 * here would, for the fingerprint, wipe the index on the next launch.
 */
export function mergeIndexPrefs(
  stored: Prefs['index'],
  config: IndexConfig,
  patch: Partial<IndexConfig>,
): NonNullable<Prefs['index']> {
  return { ...stored, ...config, ...patch };
}

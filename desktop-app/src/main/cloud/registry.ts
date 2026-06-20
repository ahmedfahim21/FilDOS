import type { Provider } from './provider';

/**
 * Global provider registry. Each cloud integration calls `registerProvider`
 * once at startup. The FS handler uses `getProvider` to dispatch remote URIs
 * to the right implementation.
 *
 * Example (in main/index.ts):
 *   import { registerProvider } from './cloud/registry';
 *   import { GDriveProvider } from './cloud/gdrive';
 *   registerProvider('gdrive', new GDriveProvider());
 */

const registry = new Map<string, Provider>();

/** Register a provider under a URI scheme identifier (e.g. 'gdrive'). */
export function registerProvider(providerId: string, provider: Provider): void {
  registry.set(providerId, provider);
}

/** Look up a registered provider. Returns null if the scheme is unknown. */
export function getProvider(providerId: string): Provider | null {
  return registry.get(providerId) ?? null;
}

/** Identifiers of all currently registered providers. */
export function registeredProviders(): string[] {
  return [...registry.keys()];
}

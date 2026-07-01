import type { AiProvider } from './providers/types';
import { getPrefs } from '../prefs';

/**
 * Global AI provider registry. Each integration calls `registerAiProvider`
 * once at startup; handlers dispatch through `activeAiProvider`, which honours
 * the user's choice in `prefs.ai.activeProvider`. Mirrors `cloud/registry.ts`.
 *
 * Example (in main/index.ts):
 *   registerAiProvider('embedded', new EmbeddedAiProvider());
 *   registerAiProvider('cloud', new CloudAiProvider());
 */

const registry = new Map<string, AiProvider>();

/** Register a provider under its id (e.g. 'embedded'). */
export function registerAiProvider(providerId: string, provider: AiProvider): void {
  registry.set(providerId, provider);
}

/** Look up a registered provider. Returns null if the id is unknown. */
export function getAiProvider(providerId: string): AiProvider | null {
  return registry.get(providerId) ?? null;
}

/** Identifiers of all currently registered providers. */
export function registeredAiProviders(): string[] {
  return [...registry.keys()];
}

/** The provider selected in prefs (defaults to 'embedded'). */
export async function activeAiProvider(): Promise<AiProvider | null> {
  const prefs = await getPrefs();
  return getAiProvider(prefs.ai?.activeProvider ?? 'embedded');
}

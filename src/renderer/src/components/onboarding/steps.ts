import type { Prefs } from '@shared/types';

/**
 * The first-run onboarding flow (pure logic, UI in Onboarding.tsx). The step
 * list is dynamic: the file-access step only exists on macOS (TCC gates
 * Desktop/Documents/Downloads there; other platforms have no such prompt),
 * and the assistant + models + privacy steps only when the user opted into
 * AI — the chat model (mandatory pick on its own page), the optional models
 * (reranker/NER) and everything on the privacy step (Hide from AI, ambient
 * indexing) are meaningless without the AI layer.
 */

export type OnboardingStepId =
  | 'welcome'
  | 'appearance'
  | 'access'
  | 'ai'
  | 'assistant'
  | 'models'
  | 'privacy'
  | 'ready';

export function onboardingSteps(opts: { aiEnabled: boolean; isMac: boolean }): OnboardingStepId[] {
  const steps: OnboardingStepId[] = ['welcome', 'appearance'];
  if (opts.isMac) steps.push('access');
  steps.push('ai');
  if (opts.aiEnabled) steps.push('assistant', 'models', 'privacy');
  steps.push('ready');
  return steps;
}

/**
 * Whether this launch should show onboarding. `onboarded` is the completion
 * flag; `lastPath` doubles as an "existing install" marker so users who were
 * already using FilDOS before onboarding shipped aren't walked through setup
 * they've effectively done.
 */
export function needsOnboarding(prefs: Prefs): boolean {
  return !prefs.onboarded && prefs.lastPath === undefined;
}

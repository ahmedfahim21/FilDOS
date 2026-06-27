import type { Theme } from '@shared/types';

/**
 * Drives the app's color theme by toggling a `.dark` class on <html> (the CSS in
 * styles/global.css keys all tokens off it). 'system' tracks the OS via
 * matchMedia and follows live changes; 'light'/'dark' force a choice that wins
 * over the OS. Persisted in prefs.theme and applied at boot (main.tsx).
 */

const mql = window.matchMedia('(prefers-color-scheme: dark)');
let current: Theme = 'system';

function isDark(theme: Theme): boolean {
  return theme === 'dark' || (theme === 'system' && mql.matches);
}

function paint(): void {
  document.documentElement.classList.toggle('dark', isDark(current));
}

// While on 'system', follow OS theme changes.
mql.addEventListener('change', () => {
  if (current === 'system') paint();
});

/** Apply the chosen theme to the document. */
export function applyTheme(theme: Theme): void {
  current = theme;
  paint();
}

// Paint the system default at import time so there's no flash before prefs load.
paint();

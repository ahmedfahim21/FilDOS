import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { Prefs } from '@shared/types';
import App from './App';
import { applyTheme } from './lib/theme';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Splash } from './components/Splash';
import '@fontsource-variable/inter';
import '@fontsource/space-mono/400.css';
import '@fontsource/space-mono/700.css';
import './styles/global.css';

/** Resolves the starting directory and preferences before mounting the browser. */
function Root() {
  const [boot, setBoot] = useState<{ path: string; prefs: Prefs } | null>(null);

  useEffect(() => {
    (async () => {
      const prefs = await window.prefs.get().catch(() => ({}) as Prefs);
      applyTheme(prefs.theme ?? 'system');

      // Prefer the last folder if it still exists and is a directory.
      let path: string | undefined = prefs.lastPath;
      if (path) {
        const info = await window.fsapi.getInfo(path);
        if (!(info.ok && info.data.isDirectory)) path = undefined;
      }
      if (!path) {
        const home = await window.fsapi.getHome();
        path = home.ok ? home.data : '/';
      }

      setBoot({ path, prefs });
    })();
  }, []);

  if (!boot) return <Splash />;
  return <App initialPath={boot.path} initialPrefs={boot.prefs} />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <Root />
    </ErrorBoundary>
  </StrictMode>,
);

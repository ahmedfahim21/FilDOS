import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';

export interface Clip {
  paths: string[];
  mode: 'copy' | 'cut';
}

interface ClipboardContextValue {
  clip: Clip | null;
  copy: (paths: string[]) => void;
  cut: (paths: string[]) => void;
  clear: () => void;
}

const ClipboardContext = createContext<ClipboardContextValue | null>(null);

export function ClipboardProvider({ children }: { children: ReactNode }) {
  const [clip, setClip] = useState<Clip | null>(null);

  const copy = useCallback((paths: string[]) => {
    if (paths.length) setClip({ paths, mode: 'copy' });
  }, []);
  const cut = useCallback((paths: string[]) => {
    if (paths.length) setClip({ paths, mode: 'cut' });
  }, []);
  const clear = useCallback(() => setClip(null), []);

  return (
    <ClipboardContext.Provider value={{ clip, copy, cut, clear }}>
      {children}
    </ClipboardContext.Provider>
  );
}

export function useClipboard(): ClipboardContextValue {
  const ctx = useContext(ClipboardContext);
  if (!ctx) throw new Error('useClipboard must be used within ClipboardProvider');
  return ctx;
}

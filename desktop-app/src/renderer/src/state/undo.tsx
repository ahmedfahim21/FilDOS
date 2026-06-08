import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import type { Result } from '@shared/types';

/** A reversible action: `run` performs the inverse of what the user just did. */
export interface UndoEntry {
  label: string;
  run: () => Promise<Result<unknown>>;
}

interface UndoContextValue {
  canUndo: boolean;
  push: (entry: UndoEntry) => void;
  /** Remove and return the most recent entry (caller executes it). */
  pop: () => UndoEntry | null;
}

const UndoContext = createContext<UndoContextValue | null>(null);

const MAX_DEPTH = 50;

export function UndoProvider({ children }: { children: ReactNode }) {
  const stack = useRef<UndoEntry[]>([]);
  const [count, setCount] = useState(0);

  const push = useCallback((entry: UndoEntry) => {
    stack.current.push(entry);
    if (stack.current.length > MAX_DEPTH) stack.current.shift();
    setCount(stack.current.length);
  }, []);

  const pop = useCallback(() => {
    const entry = stack.current.pop() ?? null;
    setCount(stack.current.length);
    return entry;
  }, []);

  return (
    <UndoContext.Provider value={{ canUndo: count > 0, push, pop }}>
      {children}
    </UndoContext.Provider>
  );
}

export function useUndo(): UndoContextValue {
  const ctx = useContext(UndoContext);
  if (!ctx) throw new Error('useUndo must be used within UndoProvider');
  return ctx;
}

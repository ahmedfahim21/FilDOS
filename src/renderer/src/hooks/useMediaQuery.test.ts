import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useMediaQuery } from './useMediaQuery';

/** A controllable matchMedia: `set` flips the match and fires `change`. */
function fakeMatchMedia(initial: boolean) {
  let matches = initial;
  const listeners = new Set<() => void>();
  const asked: string[] = [];
  vi.stubGlobal('matchMedia', (query: string) => {
    asked.push(query);
    return {
      get matches() {
        return matches;
      },
      addEventListener: (_: string, fn: () => void) => listeners.add(fn),
      removeEventListener: (_: string, fn: () => void) => listeners.delete(fn),
    };
  });
  return {
    asked,
    listeners,
    set(next: boolean) {
      matches = next;
      listeners.forEach((fn) => fn());
    },
  };
}

afterEach(() => vi.unstubAllGlobals());

// React's act() needs this flag outside a testing library.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** Render the hook in a throwaway root; `current()` reads its latest value. */
function renderQuery(query: string) {
  let value: boolean | undefined;
  function Probe() {
    value = useMediaQuery(query);
    return null;
  }
  const root = createRoot(document.createElement('div'));
  act(() => root.render(createElement(Probe)));
  return { current: () => value, unmount: () => act(() => root.unmount()) };
}

describe('useMediaQuery', () => {
  it('reports the current match and follows changes', () => {
    const mm = fakeMatchMedia(true);
    const r = renderQuery('(min-width: 821px)');
    expect(r.current()).toBe(true);
    act(() => mm.set(false));
    expect(r.current()).toBe(false);
    act(() => mm.set(true));
    expect(r.current()).toBe(true);
    r.unmount();
    expect(mm.asked.every((q) => q === '(min-width: 821px)')).toBe(true);
  });

  it('stops listening on unmount', () => {
    const mm = fakeMatchMedia(false);
    const r = renderQuery('(min-width: 821px)');
    expect(mm.listeners.size).toBe(1);
    r.unmount();
    expect(mm.listeners.size).toBe(0);
  });
});

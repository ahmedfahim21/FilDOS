import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useReducer,
  type ReactNode,
} from 'react';
import { parentOf } from '@/lib/path';

export type SortKey = 'name' | 'size' | 'type' | 'modified';
export type SortDir = 'asc' | 'desc';
export type ViewMode = 'list' | 'grid';
export interface ColumnWidths {
  size: number;
  type: number;
  modified: number;
}

const DEFAULT_COLUMN_WIDTHS: ColumnWidths = { size: 100, type: 140, modified: 200 };

interface NavState {
  history: string[];
  index: number;
  showHidden: boolean;
  sort: { key: SortKey; dir: SortDir };
  viewMode: ViewMode;
  columnWidths: ColumnWidths;
  /** Filter / search query for the current directory. */
  query: string;
  /** When true, the query searches subfolders recursively (else filters in place). */
  searchRecursive: boolean;
  /** Bumped to force the current directory to reload. */
  refreshToken: number;
}

type Action =
  | { type: 'navigate'; path: string }
  | { type: 'back' }
  | { type: 'forward' }
  | { type: 'up' }
  | { type: 'toggleHidden' }
  | { type: 'setSort'; key: SortKey }
  | { type: 'setViewMode'; mode: ViewMode }
  | { type: 'setColumnWidth'; column: keyof ColumnWidths; width: number }
  | { type: 'setQuery'; query: string }
  | { type: 'setSearchRecursive'; value: boolean }
  | { type: 'refresh' };

function reducer(state: NavState, action: Action): NavState {
  switch (action.type) {
    case 'navigate': {
      const current = state.history[state.index];
      if (action.path === current) return state;
      const history = [...state.history.slice(0, state.index + 1), action.path];
      return { ...state, history, index: history.length - 1, query: '' };
    }
    case 'back':
      return state.index > 0 ? { ...state, index: state.index - 1, query: '' } : state;
    case 'forward':
      return state.index < state.history.length - 1
        ? { ...state, index: state.index + 1, query: '' }
        : state;
    case 'up': {
      const current = state.history[state.index];
      const parent = parentOf(current);
      if (parent === current) return state;
      const history = [...state.history.slice(0, state.index + 1), parent];
      return { ...state, history, index: history.length - 1, query: '' };
    }
    case 'toggleHidden':
      return { ...state, showHidden: !state.showHidden };
    case 'setSort': {
      if (state.sort.key === action.key) {
        return {
          ...state,
          sort: { key: action.key, dir: state.sort.dir === 'asc' ? 'desc' : 'asc' },
        };
      }
      return { ...state, sort: { key: action.key, dir: 'asc' } };
    }
    case 'setViewMode':
      return { ...state, viewMode: action.mode };
    case 'setQuery':
      return { ...state, query: action.query };
    case 'setSearchRecursive':
      return { ...state, searchRecursive: action.value };
    case 'setColumnWidth':
      return {
        ...state,
        columnWidths: {
          ...state.columnWidths,
          [action.column]: Math.max(60, Math.round(action.width)),
        },
      };
    case 'refresh':
      return { ...state, refreshToken: state.refreshToken + 1 };
    default:
      return state;
  }
}

interface NavContextValue extends NavState {
  currentPath: string;
  canGoBack: boolean;
  canGoForward: boolean;
  navigate: (path: string) => void;
  back: () => void;
  forward: () => void;
  up: () => void;
  toggleHidden: () => void;
  setSort: (key: SortKey) => void;
  setViewMode: (mode: ViewMode) => void;
  setColumnWidth: (column: keyof ColumnWidths, width: number) => void;
  setQuery: (query: string) => void;
  setSearchRecursive: (value: boolean) => void;
  refresh: () => void;
}

const NavContext = createContext<NavContextValue | null>(null);

export interface NavInitial {
  showHidden?: boolean;
  sort?: { key: SortKey; dir: SortDir };
  viewMode?: ViewMode;
  columnWidths?: ColumnWidths;
}

export function NavigationProvider({
  initialPath,
  initial,
  children,
}: {
  initialPath: string;
  initial?: NavInitial;
  children: ReactNode;
}) {
  const [state, dispatch] = useReducer(reducer, {
    history: [initialPath],
    index: 0,
    showHidden: initial?.showHidden ?? false,
    sort: initial?.sort ?? { key: 'name', dir: 'asc' },
    viewMode: initial?.viewMode ?? 'list',
    columnWidths: initial?.columnWidths ?? DEFAULT_COLUMN_WIDTHS,
    query: '',
    searchRecursive: false,
    refreshToken: 0,
  });

  const navigate = useCallback((path: string) => dispatch({ type: 'navigate', path }), []);
  const back = useCallback(() => dispatch({ type: 'back' }), []);
  const forward = useCallback(() => dispatch({ type: 'forward' }), []);
  const up = useCallback(() => dispatch({ type: 'up' }), []);
  const toggleHidden = useCallback(() => dispatch({ type: 'toggleHidden' }), []);
  const setSort = useCallback((key: SortKey) => dispatch({ type: 'setSort', key }), []);
  const setViewMode = useCallback((mode: ViewMode) => dispatch({ type: 'setViewMode', mode }), []);
  const setColumnWidth = useCallback(
    (column: keyof ColumnWidths, width: number) =>
      dispatch({ type: 'setColumnWidth', column, width }),
    [],
  );
  const setQuery = useCallback((query: string) => dispatch({ type: 'setQuery', query }), []);
  const setSearchRecursive = useCallback(
    (value: boolean) => dispatch({ type: 'setSearchRecursive', value }),
    [],
  );
  const refresh = useCallback(() => dispatch({ type: 'refresh' }), []);

  const value = useMemo<NavContextValue>(
    () => ({
      ...state,
      currentPath: state.history[state.index],
      canGoBack: state.index > 0,
      canGoForward: state.index < state.history.length - 1,
      navigate,
      back,
      forward,
      up,
      toggleHidden,
      setSort,
      setViewMode,
      setColumnWidth,
      setQuery,
      setSearchRecursive,
      refresh,
    }),
    [
      state,
      navigate,
      back,
      forward,
      up,
      toggleHidden,
      setSort,
      setViewMode,
      setColumnWidth,
      setQuery,
      setSearchRecursive,
      refresh,
    ],
  );

  return <NavContext.Provider value={value}>{children}</NavContext.Provider>;
}

export function useNavigation(): NavContextValue {
  const ctx = useContext(NavContext);
  if (!ctx) throw new Error('useNavigation must be used within NavigationProvider');
  return ctx;
}

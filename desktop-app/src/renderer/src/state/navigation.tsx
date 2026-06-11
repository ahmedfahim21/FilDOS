import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useReducer,
  type ReactNode,
} from 'react';
import type { IconSize, SortDir, SortKey, ViewMode } from '@shared/types';
import { parentOf } from '@/lib/path';

export type { IconSize, SortDir, SortKey, ViewMode };
export interface ColumnWidths {
  size: number;
  type: number;
  modified: number;
}

const DEFAULT_COLUMN_WIDTHS: ColumnWidths = { size: 100, type: 140, modified: 200 };

/** The view settings a folder can remember (and prefs store globally). */
export interface ViewState {
  sort: { key: SortKey; dir: SortDir };
  viewMode: ViewMode;
  iconSize: IconSize;
}

interface NavState {
  history: string[];
  index: number;
  showHidden: boolean;
  sort: { key: SortKey; dir: SortDir };
  viewMode: ViewMode;
  iconSize: IconSize;
  columnWidths: ColumnWidths;
  /**
   * Bumped on every USER view change (sort/viewMode/iconSize) — but not when
   * a folder's remembered view is applied — so persistence effects can tell
   * deliberate edits apart from navigation.
   */
  viewEdit: number;
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
  | { type: 'setIconSize'; size: IconSize }
  | { type: 'applyView'; view: ViewState }
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
      const sort =
        state.sort.key === action.key
          ? { key: action.key, dir: (state.sort.dir === 'asc' ? 'desc' : 'asc') as SortDir }
          : { key: action.key, dir: 'asc' as SortDir };
      return { ...state, sort, viewEdit: state.viewEdit + 1 };
    }
    case 'setViewMode':
      return { ...state, viewMode: action.mode, viewEdit: state.viewEdit + 1 };
    case 'setIconSize':
      return { ...state, iconSize: action.size, viewEdit: state.viewEdit + 1 };
    case 'applyView':
      // A folder's remembered view; deliberately does NOT bump viewEdit.
      return {
        ...state,
        sort: action.view.sort,
        viewMode: action.view.viewMode,
        iconSize: action.view.iconSize,
      };
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
  setIconSize: (size: IconSize) => void;
  applyView: (view: ViewState) => void;
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
  iconSize?: IconSize;
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
    iconSize: initial?.iconSize ?? 'medium',
    columnWidths: initial?.columnWidths ?? DEFAULT_COLUMN_WIDTHS,
    viewEdit: 0,
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
  const setIconSize = useCallback((size: IconSize) => dispatch({ type: 'setIconSize', size }), []);
  const applyView = useCallback((view: ViewState) => dispatch({ type: 'applyView', view }), []);
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
      setIconSize,
      applyView,
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
      setIconSize,
      applyView,
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

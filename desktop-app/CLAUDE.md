# FilDOS

An **AI-native file browser for PCs**. The AI layer (semantic / natural-language
search, smart organization) is the eventual goal but is deliberately deferred
until the file-manager foundation is complete. Phase 1 (core file manager) and
Phase 2 (feature parity + performance) are done; the AI phase is next.

## Commands

```bash
npm run dev          # electron-vite dev (HMR for renderer; main/preload rebuild on change)
npm run build        # production build into out/
npm start            # preview a production build
npm run typecheck    # tsc for both node (main/preload) and web (renderer) projects
npm run lint         # eslint (flat config, eslint.config.mjs)
npm test             # vitest run — unit + integration tests (CI runs this on all 3 OSes)
npm run test:watch   # vitest in watch mode
npm run test:e2e     # build, then Playwright smoke test against the packaged app
```

**Unit + integration (Vitest).** Tests live beside the code as `*.test.ts`,
split per feature, reusing the vite aliases via `vitest.config.ts`: renderer
tests run under jsdom, main-process tests under node. The FS service tests
(`src/main/fs/service.*.test.ts`, one file per operation — create, read, rename,
copy, move, …) are true integration tests: they exercise real files in an
`os.tmpdir()` sandbox provisioned by `src/main/fs/fixtures.ts`.

**E2E (Playwright).** `e2e/*.spec.ts` launch the *built* Electron app via
`_electron` (`playwright.config.ts`) and assert the shell boots — so `test:e2e`
builds first. On a headless Linux box run it under `xvfb-run`.

**Lint + hooks.** ESLint flat config splits env along the process boundary
(node vs. browser + React Hooks rules). A git pre-commit hook runs `lint-staged`
(`eslint --fix` on staged files); the `prepare` script installs it on
`npm install` via `scripts/install-hooks.mjs`, which resolves the real git hooks
dir with `git rev-parse` so it works from this subdirectory of the monorepo.

After changes, run `npm run lint`, `npm run typecheck`, `npm test`, and
`npm run build`; for behavior, `npm run dev` and exercise it by hand. CI
(`.github/workflows/desktop-app-ci.yml`) runs lint, typecheck+unit, and e2e on
Ubuntu, macOS, and Windows.

## Architecture

Electron + React + TypeScript, built with **electron-vite**. Three layers plus a
shared contract:

```
src/shared/      Types + IPC channel names imported by ALL layers (alias @shared)
src/main/        Main process: all filesystem access lives here
src/preload/     contextBridge — the ONLY surface the renderer can call
src/renderer/    React app (alias @ = src/renderer/src)
```

**Security model (do not weaken):** `contextIsolation: true`, `sandbox: true`,
`nodeIntegration: false`. The renderer never imports Node/Electron or touches the
disk directly — it calls `window.fsapi` / `window.watcher` / `window.dnd` /
`window.prefs`, all defined in `src/preload/index.ts` and typed in
`src/preload/index.d.ts`.

### The IPC contract (the spine of the app)

Every filesystem operation returns a discriminated
`Result<T> = { ok: true; data: T } | { ok: false; error: { code, message } }`
(`src/shared/types.ts`). The renderer checks `result.ok` instead of catching —
expected failures (EACCES/ENOENT/EEXIST/…) become friendly toasts, never crashes.

Flow for any operation: **channel constant** (`src/shared/channels.ts`) →
**preload method** (`src/preload/index.ts`, added to the `FsApi` interface in
`types.ts` + `index.d.ts`) → **handler** (`src/main/fs/handlers.ts`, wrapped in
`wrap()` which converts thrown errors via `toAppError()`) → **logic**
(`src/main/fs/service.ts`).

**To add a new FS operation:** add the channel, add it to `FsApi` in `types.ts`,
implement it in `service.ts` (throw on failure — handlers convert it), register a
handler in `handlers.ts` (validate path args with `assertValidPath`), and expose
it in `preload/index.ts`. Reuse Electron built-ins (`shell.trashItem`,
`shell.openPath`, `fs.cp`, `nativeImage.createThumbnailFromPath`, `app.getPath`)
rather than hand-rolling.

### Main process modules

- `index.ts` — app lifecycle, BrowserWindow, restores/saves window bounds via prefs.
- `fs/service.ts` — pure fs logic: listDir, getInfo, create/rename/copy/move/duplicate,
  folderSize, recursive search. Helpers: `assertValidPath`, `assertValidName`,
  `uniqueDestination` (" copy" suffixing).
- `fs/handlers.ts` — registers every `ipcMain.handle`; `wrap()` + `toAppError()`.
- `fs/watch.ts` — single non-recursive `fs.watch` on the focused dir, debounced,
  emits `Events.dirChanged` to the renderer.
- `fs/thumbnails.ts` — `nativeImage` thumbnails as data URLs, in-memory LRU-ish cache.
- `fs/trashTracker.ts` — hybrid trash (see below).
- `prefs.ts` — JSON prefs in `userData` (no electron-store dep).

### Renderer

State via React context (no Redux):
- `state/navigation.tsx` — current path + back/forward/up history, sort, showHidden,
  viewMode, columnWidths, search query/recursive flag, `refreshToken`. `useReducer`.
- `state/clipboard.tsx` — copy/cut clipboard. `state/undo.tsx` — undo stack.
  `state/toast.tsx` — notifications.
- `hooks/useDirectory.ts` — loads the dir (or recursive search), applies hidden +
  query filter + sort, subscribes to live FS changes.
- `hooks/useFileActions.ts` — **all mutations funnel through here**; each runs the
  IPC call, toasts, refreshes, and pushes an inverse onto the undo stack. Add new
  mutations here so undo stays consistent.
- `components/` — `FileList` (virtualized, resizable cols, inline rename, DnD) and
  `GridView` (thumbnails) share `viewTypes.ts#FileViewProps`. `App.tsx` owns
  selection, the global keymap, context-menu/dialog/trash state, and DnD glue.

Virtualization uses `@tanstack/react-virtual` (the only non-built-in dependency).

### Trash model = Hybrid (decided with the user)

Deletes go to the real OS Trash via `shell.trashItem`. We additionally log where
each item landed by diffing `~/.Trash` before/after (macOS only) so **Trash viewer
restore and Cmd+Z undo-of-delete are best-effort** — they can fail if the original
location is occupied or the OS renamed on collision, and the UI says so. Code:
`src/main/fs/trashTracker.ts`. On non-macOS it still trashes but skips tracking.

## Gotchas

- `fs.watch` watches one directory at a time (swapped on navigation), non-recursive.
- OS drag-out uses `webContents.startDrag` (needs a non-empty icon — falls back to a
  placeholder). The internal-vs-external drag decision (move vs copy default) is
  tracked by a ref cleared on `mousedown`; this is the most fragile area.
- `startDrag`'s type requires `file` even when passing `files` — both are set.
- Renderer reads dropped file paths via `webUtils.getPathForFile` (`window.dnd.pathForFile`).

## Out of scope (future)

Bookmarks, mounted-drives sidebar, tabs, Open-With picker, archives
— and the **AI phase**. The service/IPC/shared-types seams are built so an AI module
and new channels slot in without touching the FS core.

Planning notes live in `~/.claude/plans/i-want-to-build-snuggly-boole.md`.
```

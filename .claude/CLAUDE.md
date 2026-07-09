# FilDOS

An **AI-native file browser for PCs**. The AI layer (semantic / natural-language
search, smart organization) is the eventual goal but is deliberately deferred
until the file-manager foundation is complete. Phase 1 (core file manager) and
Phase 2 (feature parity + performance) are done; the AI phase is next.

**Design system:** colours, typography, the mark and the wordmark follow
`.claude/brand-guidelines.md` (black-and-white Ink/Mist/Cloud foundation + six
"scoop" accents, Space Grotesk + Space Mono, the `<Logo>`/`<Mark>`/`<Wordmark>`
components). Read it before any UI or styling work.

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
dir with `git rev-parse` so it works regardless of where the app sits in the repo.

After changes, run `npm run lint`, `npm run typecheck`, `npm test`, and
`npm run build`; for behavior, `npm run dev` and exercise it by hand. CI
(`.github/workflows/ci.yml`) runs lint, typecheck+unit, and e2e on
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
`window.prefs` / `window.tags` / `window.recents` / `window.views`, all defined
in `src/preload/index.ts` and typed in `src/preload/index.d.ts`.

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
  folderSize, recursive name search. The search **tokenizes**: query and names
  are separator-normalized (`_-.,()` → space) and every query token must appear
  ("modern angular" matches `Modern_Angular_….pdf`); the walk is **breadth-first**
  under a 3s deadline + 300-hit cap so shallow files everywhere beat deep
  corners of one subtree; junk trees are skipped via
  `ai/index/ignore.ts#isIgnoredForNameSearch` (softer than the index's list —
  tmp/temp/Applications stay searchable) relative to the search root; ranking is
  exact > prefix > token match (tiers in `@shared/searchMatch.ts`, shared with
  the renderer). The overlay sweeps the folder in view first when scope is
  "Everywhere" and renders **one fused result list** — filename evidence anchors
  the rank, semantic score is discounted against it, both-lane hits get a bump —
  never separate "semantic vs name" sections. Helpers: `assertValidPath`,
  `assertValidName`, `uniqueDestination` (" copy" suffixing).
- `fs/handlers.ts` — registers every `ipcMain.handle`; `wrap()` + `toAppError()`.
- `fs/watch.ts` — single non-recursive `fs.watch` on the focused dir, debounced,
  emits `Events.dirChanged` to the renderer.
- `fs/thumbnails.ts` — `nativeImage` thumbnails as data URLs, in-memory LRU-ish cache.
- `db/` — SQLite metadata layer (see below): tags, recents, per-folder views.
- `prefs.ts` — prefs in the SQLite `prefs` table (JSON values).
- `ai/` — the AI seam (see below): provider registry + embedded embedding worker.

### The AI layer (`src/main/ai/`)

The foundation of the AI phase. It **mirrors the cloud provider seam**: an
`AiProvider` interface (`providers/types.ts`), a runtime `registry.ts`
(register/get + `activeAiProvider()` from `prefs.ai.activeProvider`), and two
providers — `providers/embedded.ts` (on-device) and `providers/cloud.ts` (a
deferred stub that throws `EUNSUPPORTED`). Handlers in `ai/handlers.ts`
(`ai:status` / `ai:download` / `ai:embed` / `ai:embedImages`, wrapped in
`Result<T>`) resolve the active model id (`prefs.ai.modelId`) and dispatch to the
active provider; `Events.aiModelProgress` streams download progress per model.

`src/shared/aiModels.ts` is the **model catalog** (shared by worker + Settings):
several `feature-extraction` text/code models (MiniLM, BGE, GTE, multilingual
E5; 384-d) plus a `clip` image model (CLIP ViT-B/32, 512-d) that embeds **both**
text and image files into one space. Each entry has a `kind` the worker switches
on. Adding a model = one catalog entry (verify it loads with `dtype: 'q8'` and
record its dim); no other code changes for feature-extraction models.

Embeddings run **on-device** via `@huggingface/transformers` on the **WASM**
backend — zero native deps, matching the `node:sqlite` philosophy.
`modelWorker.ts` runs in an Electron `utilityProcess` (so load/inference never
block the main process), memoizes one loaded model per id, and is a **second
main entry** in `electron.vite.config.ts`; `transformers` is ESM-only so the
worker `import()`s it dynamically. onnxruntime-web's `.wasm` files are copied
beside the worker (`out/main`) by the inline `copyOnnxWasm` plugin, and the
worker points `wasmPaths` at its own `__dirname` to stay offline. Models cache to
`userData/models` (the main process hands the worker that path via
`process.env.FILDOS_MODELS_DIR`, since a utilityProcess can't call
`app.getPath`). The renderer drives it from Settings (`state/ai.tsx` context +
`components/SettingsView.tsx`, with a per-model picker and live status).

**Indexer (`src/main/ai/index/`).** The background pipeline that turns files into
searchable vectors. `extract.ts` (text/code/data by extension; binary + size-cap
skip) → `chunk.ts` (~512-token char-approx windows) → the active provider's
`embed()` → `db/vectorStore.sqlite.ts` (Float32 BLOBs; brute-force cosine over
an **in-memory vector cache** — vectors only, no texts — warmed on first search
and kept coherent by upsert/remove/remap/clear, so queries never re-read every
BLOB; all chunk-row deletions must route through `vectorStore.remove`, not
`aiIndex.remove` directly. No ANN/vector DB: dot products over a personal-scale
index are tens of ms; the cache was the fix). `search.ts` fuses vector + BM25
(RRF), reranks only the top 16 candidates at 600 chars each (the cross-encoder
runs on WASM — more would take seconds), and gates the CLIP image lane on the
model already being downloaded.
PDFs parse through a **byte-range file transport** (no whole-file buffering —
book-size PDFs up to 512 MB extract with bounded memory, capped at 300 K chars:
a book's search identity is its front matter, and every 2 KB chunk is an
inference). The queue is **cost-classed** (`index_jobs.priority`: removals +
text first, images next, pdf/docx last) so a fresh index is useful in minutes,
and the pipeline is **duty-cycled** via an injected `pace()` (powerMonitor:
~full speed when the user is away, ~half while active, gentler on battery).
Files whose content still can't be extracted (corrupt/scanned docs) are
never dropped from the index: they get a single **filename-fallback chunk**
(humanized basename) so name queries still find them through both lanes —
that's `INDEX_VERSION` 2, and `isStale` migrates v1 rows selectively (only
'skipped' ones) instead of re-embedding the world.
`indexer.ts` is the orchestrator: it crawls the configured roots (default the
home dir; `ignore.ts` skips dotfiles, system trees (Library/AppData/Windows/…),
`node_modules`/caches/bundles + the user's "Hide from AI" list), compares
`fs.stat` to `index_state` so unchanged files are no-ops, and drains the
persistent `index_jobs` queue as a two-stage pipeline — `prepare` (stat/hash/
extract/chunk I/O) runs one file ahead of `commit` (embed + persist), yielding
between files; a failed file is marked errored, never fatal. **Codebases** (a
dir with a marker like `.git`/`package.json`/`Cargo.toml`, see
`CODEBASE_MARKERS` in `ignore.ts`) are indexed docs-only (md/rst/txt/pdf/docx)
— source files of checked-out repos would drown search; build output inside a
codebase (dist/out/build/target/…, `isCodebaseBuildDir`) is never descended, and
a crawl root itself is never treated as a codebase. Users can also exclude whole
**file extensions** (`prefs.index.excludeExtensions`; "Skip file types" chips in
Settings → Indexing — setting it kicks a reconcile that prunes existing entries). The embed worker runs multi-threaded WASM
(`numThreads` capped at half the cores) at low OS priority (`setPriority` in
`providers/embedded.ts`) so indexing doesn't fight foreground work. `watcher.ts`
keeps it fresh — a recursive `fs.watch` per root (mac/Windows; Linux falls back)
plus a periodic reconcile timer. `index/handlers.ts` owns the singleton indexer
+ watcher, the `index:*` channels (`start`/`pause`/`clear`/`status` + Hide-from-
AI management + `setAmbient`) and `Events.indexProgress`; startup resumes
leftover jobs, quit tears watches down. **Ambient mode** (`prefs.index.ambient`,
default on): when the last window closes with indexing enabled, the app stays
resident in the menu bar / system tray (`src/main/tray.ts`, wired in
`main/index.ts#window-all-closed`; the tray icon rasterises the brand mark, its
menu shows live progress) and keeps indexing; on macOS the Dock icon hides too.
Renderer: `state/indexing.tsx` + the Indexing and "Hide from AI" sections in
`SettingsView.tsx`, and a "Hide from AI" context-menu action (native picker via
`index:pickExcludes`). Dependencies are injected into `Indexer`/`IndexWatcher`
so tests drive them with a fake provider, no Electron.

**Knowledge graph (`src/main/ai/graph/`) — the "Canvas" view.** A relationship
engine over the index plus a GPU-rendered constellation page. Three signals:
embedding **similarity** (per-file centroids of the stored chunk vectors →
partitioned kNN in `similarity.ts`, cached in `graph_edges`), **entities**
(on-device NER — `kind: 'ner'` in the model catalog / `modelWorker`, BIO-merge +
normalization in `ner.ts`, persisted to `entities`/`file_entities` with
per-file staleness in `entity_state`), and **temporal sessions** (`temporal.ts`,
derived at snapshot time from mtimes — cross-folder star edges only). All graph
tables FK onto `index_state(path)` with cascades, so rename/move/delete carry
them like `file_chunks`. `builder.ts` (`GraphBuilder`, deps injected like
`Indexer`) is **lazy + incremental**: nothing runs until `graph:get`, a prefs
watermark (`prefs.graph`) marks staleness, rebuilds touch only changed files,
and the whole thing runs under the indexer's duty-cycle `pace`. The NER model
(`Xenova/bert-base-NER`) is **opt-in like the reranker** — never
auto-downloaded; the graph works without it. `snapshot.ts` fuses everything
into a render-ready `GraphSnapshot` (`@shared/graphTypes`): Louvain communities
(graphology, seeded rng) → `clusterId`, node cap 4000 by degree.
`graph/handlers.ts` owns `graph:*` + `Events.graphProgress`; builds are
fire-and-forget (`graph:get` returns the stored snapshot and kicks a background
refresh; the renderer re-fetches on the idle transition). Renderer:
`window.graph` → `components/graph/` — `GraphView` (a lazy-loaded NavLocation
page, `{ kind: 'graph' }`), `useCosmos` (thin imperative bridge to
**cosmos.gl** — `@cosmos.gl/graph`, GPU force layout + WebGL rendering), and
`graphViz.ts` (pure snapshot→typed-array mapping: structure vs. paint split so
search/scrubber repaints never reheat the simulation; scoop colours per Louvain
cluster, mint diamonds for entities, tag-coloured stars, edge colours matching
the filter chips). The page has a search box, edge-kind chips, a click detail
panel ("why connected"), and an mtime histogram **time scrubber with replay**.
Settings → Searching → "Canvas": NER download + Rebuild.

**Assistant chat (`src/main/ai/llm/`).** The "Ask AI" panel: chat with your
files via a fully on-device LLM. The engine is **node-llama-cpp** (llama.cpp
with prebuilt platform binaries — Metal on Apple Silicon; the one deliberate
exception to the zero-native-deps rule, because WASM generation is unusably
slow). `llmWorker.ts` is a third main entry in `electron.vite.config.ts`,
running in its own `utilityProcess`: it downloads GGUF weights from the catalog
in `src/shared/llmModels.ts` into `userData/models/llm/<id>/` (via
`FILDOS_LLM_DIR`), keeps **one model resident** (switching disposes the old
one), runs **one chat at a time**, and streams tokens back as unsolicited
`chunk` messages. `manager.ts` bridges it (mirrors `providers/embedded.ts`);
`context.ts` builds the prompt from `@file` mentions (`extract.ts`), `#folder`
mentions (`listDir`) and `/`commands — `/find` runs `searchIndex()` (exported
from `index/handlers.ts`) first and hands the hits to the model + UI;
`handlers.ts` owns `llm:*`/`chat:*`/`chats:*` channels and streams
`Events.chatStream` / `Events.llmModelProgress`. **Every exchange is persisted**
to `db/chats.ts` (`chat_sessions` + `chat_messages`; session minted lazily on
first send — `chatSend` returns the sessionId; mentions and /find sources are
stored as JSON snapshots) so conversations can be reopened and continued from
the sidebar's history view. Renderer: `window.llm` + `window.chats` (preload)
→ `state/chat.tsx` (conversation, session list/resume, model pick persisted to
`prefs.ai.llmModelId`, download states, system specs, per-model configs) →
`components/ChatSidebar.tsx` (docked right of the content pane). The composer
autocomplete lives in `lib/chatComposer.ts` and answers render through
`lib/markdownLite.tsx` (both pure + unit-tested). **Model management lives in
Settings** (the Assistant section in `SettingsView.tsx`): download/remove
weights, a device summary from the worker's `specs` probe (llama.cpp GPU
backend + memory) with `recommendLlmModel()` picking the best fit, and a
per-model customize panel (temperature/top-p/max tokens/context/custom
instructions) stored as partials in `prefs.ai.llmConfigs` and resolved+clamped
by `resolveLlmConfig()` on both sides of the IPC boundary; the chat picker
lists only downloaded models with their config summary. The built-in catalog
spans 0.6B–35B (every URI verified against the HF API), grouped by family in
Settings' **Assistant tab** (searchable, filterable by text/vision modality —
`LlmModelDef.modality`, badge-only until image input lands); users can also
**add any GGUF from the internet** (Settings → "Add a model from the
internet", with a link to HF's trending GGUF list): `parseCustomModelInput()`
accepts `hf:owner/repo[:quant]`, `owner/repo`, or a direct `.gguf` URL and the
defs persist in `prefs.ai.llmCustomModels` — handlers resolve defs from
catalog ∪ prefs and pass the `uri` to the worker, which no longer validates
against the static catalog. Every def carries a `family` key ('llama'/'qwen'/
'gemma'/'phi'/'mistral'/'smollm'/'deepseek'/'granite'/'lfm'/'custom') mapped
to a logo in `lib/modelLogo.ts`. Adding a built-in chat model = one
`LLM_MODELS` entry. Adding a slash command = a `CHAT_COMMANDS` entry + an
instruction in `context.ts`.
**Chat tools:** the model can act on files via node-llama-cpp function
calling. `@shared/chatTools.ts` is the tool catalog (create/copy/move/rename/
delete-to-Trash/list/read, GBNF JSON schemas); the worker builds session
functions whose handlers RPC each call to main (`toolCall` out → `toolResult`
in, 30s timeout, plus a no-tools retry when a chat wrapper can't drive
function calling); `llm/tools.ts` executes them against fs/service with
injected env deps (Trash, remap, index-drop, extract — tested against a temp
dir in `tools.test.ts`). Every action is recoverable: deletes go to the OS
Trash, creations/copies never overwrite. Calls stream to the renderer as
`{type:'tool'}` events on `Events.chatStream` (activity chips in
`ChatSidebar`) and persist as a `tool_calls` JSON snapshot on
`chat_messages`. `SettingsView` is tabbed: General / AI & Search / Assistant
(model library) / Privacy (Hide from AI).

### The database layer (`src/main/db/`)

Everything that isn't the filesystem itself lives in SQLite at
`userData/fildos.db`. The engine is Node's **built-in `node:sqlite`** (zero
native deps — nothing to rebuild for Electron's ABI, and vitest can hit the
real engine), with **Drizzle ORM** on top via its `sqlite-proxy` driver (a
~15-line adapter in `connection.ts`). Because `node:sqlite` is still
experimental, bundlers don't know it as a builtin; it's loaded with
`process.getBuiltinModule('node:sqlite')` (never a static import). Requires
Electron ≥ 35 (Node 22) — CI runs Node 22 for the same reason.

- `connection.ts` — open/close, the Drizzle proxy adapter. `initDb(file)` once
  at startup; features call `db()`. Tests use `initDb(':memory:')`.
- `migrations.ts` — plain-SQL migrations versioned via `PRAGMA user_version`;
  append-only. `schema.ts` mirrors the DDL as Drizzle tables for query typing.
  For a schema change, `npm run db:generate` (drizzle-kit, config in
  `drizzle.config.ts`) scaffolds the diff SQL into `/drizzle` — review it
  (e.g. the COLLATE NOCASE on `tags.name` is hand-written) and paste it as a
  new MIGRATIONS entry; the runtime never reads `/drizzle`.
- `tags.ts` / `recents.ts` / `views.ts` — feature queries. Every mutation is a
  single statement (no multi-await transactions, so concurrent IPC handlers
  can't interleave).
- `aiIndex.ts` / `indexJobs.ts` / `vectorStore.sqlite.ts` — the AI index storage:
  `index_state` (per-file bookkeeping) + `file_chunks` (text + Float32 embedding
  BLOB, FK cascade) + `index_jobs` (the persistent indexing queue). Same
  single-statement-mutation discipline; consumed by the indexer above.
- `remap.ts` — after rename/move, handlers call `remapPaths(old, new, sep)` to
  carry tags/recents/folder-views/`index_state` along (raw `UPDATE OR REPLACE`,
  prefix-safe; `file_chunks` follows `index_state` via its FK cascade).

Stale rows (files deleted outside FilDOS) are pruned lazily when a tag's files
or the recents list are fetched, by stat'ing each path in the handler.

Per-folder views: a deliberate sort/view-mode/icon-size change becomes the new
global default (prefs) *and* the current folder's remembered view
(`folder_views`); navigation applies the remembered view or falls back to the
global default. The split lives in `state/navigation.tsx` (`viewEdit` counter:
user edits bump it, `applyView` doesn't) and the two effects at the top of
`App.tsx#Browser`.

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
- `hooks/useTags.ts` — tag list + path→tags map for the visible entries; **all
  tag mutations funnel through here** so the sidebar, dots, menus and info
  panel stay in sync.
- `components/` — `FileList` (virtualized, resizable cols, inline rename, DnD) and
  `GridView` (thumbnails, icon-size variants) share `viewTypes.ts#FileViewProps`.
  `RecentsView` / `TagFilesView` are in-flow **page views** (shared
  `Page` shell in `Page.tsx`) that replace the file browser in `<main>`: they are
  history entries (`NavLocation` in `state/navigation.tsx`), so the toolbar
  Back/Forward arrows traverse them alongside folders, and `nav.page` selects
  which renders. `App.tsx` owns selection, the global keymap (inert while a page
  is shown), context-menu/dialog state, and DnD glue (incl. drop-on-tag).

Runtime deps are `@tanstack/react-virtual` (virtualization) and `drizzle-orm`
(pure-TS, no binaries).

### Delete model = OS Trash only (no FilDOS trash feature)

Delete moves items to the real OS Trash/Recycle Bin via `shell.trashItem`
(`Channels.trash` in `fs/handlers.ts`; remote paths delegate to the provider's
`trash`). FilDOS keeps **no trash of its own** — there is no in-app Trash view,
restore, empty-trash, or Cmd+Z undo-of-delete; recover from Finder/Explorer if
needed. (An earlier hybrid `~/.Trash`-diffing tracker was removed as unreliable.)

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

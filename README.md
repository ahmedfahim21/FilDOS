# FilDOS

An AI-native file browser for the desktop. FilDOS is a fast, native-feeling file
manager built on Electron that adds an on-device AI layer — semantic search and
smart organization that run entirely on your machine, with no files leaving it.

## Features

- **Complete file management** — browse, create, rename, copy, move, duplicate,
  and delete, with a virtualized list view, a thumbnail grid, inline rename,
  drag-and-drop (including OS drag-in and drag-out), and resizable columns.
- **Tags, recents, and per-folder views** — lightweight metadata that lives in a
  local SQLite database and follows files across renames and moves.
- **On-device semantic search** — files are indexed into vector embeddings. Nothing is uploaded; models
  and vectors stay in your user-data directory.
- **Multimodal indexing** — text and code, plus PDF and DOCX extraction, and
  image search via CLIP, which embeds text and images into a shared space.
- **Background indexer** — crawls your configured roots, skips the usual noise
  (dotfiles, `node_modules`, caches, bundles), keeps itself fresh with a file
  watcher, and lets you exclude paths from indexing.

## Architecture

FilDOS is an Electron + React + TypeScript application built with electron-vite,
with a deliberately strict boundary between processes:

```
src/shared/     Types and IPC channel names shared by every layer
src/main/       Main process — all filesystem access lives here
src/preload/    contextBridge — the only surface the renderer can call
src/renderer/   The React app
```

The security model is not negotiable: `contextIsolation: true`, `sandbox: true`,
`nodeIntegration: false`. The renderer never touches disk directly — it calls a
small, typed IPC surface exposed through the preload bridge. Every filesystem
operation returns a discriminated `Result<T>`, so expected failures become
friendly messages instead of crashes.

Metadata (tags, recents, views) and the AI index (per-file state plus Float32
embedding vectors) live in SQLite via Node's built-in `node:sqlite`, with Drizzle
ORM on top — zero native dependencies to rebuild against Electron's ABI.

A deeper tour of the codebase lives in [.claude/CLAUDE.md](.claude/CLAUDE.md).

## Repository layout

```
.               The desktop app (Electron main / preload / renderer)
website/        The marketing site (Next.js)
```

## Getting started

### Prerequisites

- Node.js 22 or newer (required — the app relies on `node:sqlite`, which needs
  Node 22 / Electron ≥ 35)
- npm

**Platforms:** macOS and Linux. A Windows build is deferred until there is real
demand — the code stays cross-platform, but Windows is not currently built or
tested in CI.

### Run the desktop app

```bash
npm install      # also installs the git pre-commit hook
npm run dev      # electron-vite dev server with HMR
```

Cloud-provider OAuth credentials are optional and only needed for the deferred
cloud integrations. If you want them, copy `.env.example` to `.env` and fill in
the values.

### Build a production bundle

```bash
npm run build    # output in out/
npm start        # preview the production build
```

## Development

```bash
npm run typecheck   # tsc for the node (main/preload) and web (renderer) projects
npm run lint        # eslint (flat config)
npm test            # vitest — unit and integration tests
npm run test:watch  # vitest in watch mode
npm run test:e2e    # build, then run the Playwright smoke test on the packaged app
```

Tests live beside the code as `*.test.ts`. The filesystem service tests are true
integration tests that exercise real files in a temporary sandbox. The end-to-end
test launches the built Electron app and asserts the shell boots; on a headless
Linux machine, run it under `xvfb-run`.

Please run `npm run lint`, `npm run typecheck`, and `npm test` before opening a
pull request. See [CONTRIBUTING.md](CONTRIBUTING.md) for the full workflow.

## Tech stack

- Electron, React, TypeScript, electron-vite
- Tailwind CSS v4 and Radix primitives
- SQLite (`node:sqlite`) with Drizzle ORM
- `@huggingface/transformers` (WASM) for on-device embeddings
- Vitest and Playwright for testing

## Contributing

Contributions are welcome. Start with [CONTRIBUTING.md](CONTRIBUTING.md), and note
that this project follows a [Code of Conduct](CODE_OF_CONDUCT.md).

## License

[MIT](LICENSE) © Fahim Ahmed

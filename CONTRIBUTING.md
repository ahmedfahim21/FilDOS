# Contributing to FilDOS

Thanks for your interest in improving FilDOS. This document covers how to set up
the project, the conventions the codebase follows, and what a good pull request
looks like.

## Getting set up

Requirements:

- Node.js 22 or newer (the app uses Node's built-in `node:sqlite`, which needs
  Node 22 / Electron ≥ 35)
- npm

```bash
git clone https://github.com/ahmedfahim21/FilDOS.git
cd FilDOS
npm install        # installs dependencies and the git pre-commit hook
npm run dev        # start the app with hot reload
```

The `npm install` step runs a `prepare` script that installs a pre-commit hook
running `lint-staged` (`eslint --fix`) on staged files. If you clone without a
git checkout (for example a tarball), the hook install is skipped and non-fatal.

The website lives under `website/` and is a separate Next.js project with its own
dependencies:

```bash
cd website
npm install
npm run dev
```

## Before you open a pull request

Run the full local check suite and make sure it passes:

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

For anything that changes behavior, also run `npm run dev` and exercise the
change by hand. Continuous integration runs lint, typecheck, unit/integration
tests, and the end-to-end smoke test on Ubuntu, macOS, and Windows, so
cross-platform correctness matters.

## Architecture and conventions

Please read [.claude/CLAUDE.md](.claude/CLAUDE.md) before making substantial
changes — it explains the process boundaries, the IPC contract, the database
layer, and the AI indexer. A few points worth calling out here:

- **The security model is not negotiable.** `contextIsolation`, `sandbox`, and
  the absence of `nodeIntegration` must stay as they are. The renderer never
  imports Node or Electron and never touches disk directly; it goes through the
  typed preload bridge.
- **Filesystem operations return `Result<T>`.** Throw in the service layer;
  handlers convert thrown errors into a discriminated result the renderer checks.
- **Adding a filesystem operation** means touching the shared channel list, the
  service, the handler, and the preload surface — the steps are documented in
  CLAUDE.md. Reuse Electron built-ins rather than hand-rolling.
- **Mutations funnel through hooks** (`useFileActions`, `useTags`) so that undo,
  toasts, and the UI stay consistent. Add new mutations there.
- **Database changes** are plain-SQL migrations versioned by `PRAGMA
  user_version`, and are append-only. Use `npm run db:generate` to scaffold the
  diff, then review it and add it as a migration entry.

Match the style of the code around you: the same naming, comment density, and
idioms. Tests live beside the code as `*.test.ts`; add or update them for any
change in behavior.

## Design and UI work

FilDOS has a defined visual identity. Read
[.claude/brand-guidelines.md](.claude/brand-guidelines.md) before any UI or
styling work, and use the semantic Tailwind tokens rather than hard-coded colors.

## Commit messages and pull requests

- Write clear, present-tense commit messages that explain the intent of the
  change, not just the mechanics.
- Keep pull requests focused. A smaller, self-contained change is easier to
  review and more likely to be merged quickly.
- Describe what you changed and why, and note how you tested it. Link any related
  issue.
- Make sure CI is green.

## Reporting bugs and proposing features

Open an issue using the templates under
[.github/ISSUE_TEMPLATE](.github/ISSUE_TEMPLATE). For bugs, include your OS, the
steps to reproduce, and what you expected versus what happened. For security
issues, follow [SECURITY.md](SECURITY.md) instead of opening a public issue.

By contributing, you agree that your contributions are licensed under the
project's [MIT License](LICENSE).

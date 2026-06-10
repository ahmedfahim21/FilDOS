/**
 * Installs a git pre-commit hook that runs lint-staged for the desktop-app
 * project. Written to work from a subdirectory of a larger monorepo: it resolves
 * the *real* hooks directory via `git rev-parse` (rather than assuming the
 * package sits at the git root) and points the hook back at this project.
 *
 * Runs from the `prepare` npm lifecycle script. Any failure (no git checkout,
 * e.g. a published tarball or a shallow CI cache) is non-fatal — we skip.
 */
import { execSync } from 'node:child_process';
import { chmodSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

try {
  const git = (args) => execSync(`git ${args}`, { encoding: 'utf8' }).trim();

  const hooksDir = git('rev-parse --git-path hooks');
  const repoRoot = git('rev-parse --show-toplevel');
  const projectFromRoot = relative(repoRoot, process.cwd()) || '.';

  mkdirSync(hooksDir, { recursive: true });
  const hookPath = join(hooksDir, 'pre-commit');

  // Git runs hooks with the cwd set to the repo root, so step into the project
  // before invoking lint-staged (which reads its config from package.json here).
  const hook = [
    '#!/usr/bin/env sh',
    '# Managed by desktop-app/scripts/install-hooks.mjs — do not edit.',
    `cd "${projectFromRoot}" || exit 0`,
    'npx lint-staged',
    '',
  ].join('\n');

  writeFileSync(hookPath, hook, { mode: 0o755 });
  chmodSync(hookPath, 0o755);
  console.log(`[hooks] pre-commit installed at ${hookPath} (runs lint-staged in ${projectFromRoot})`);
} catch (err) {
  console.log(`[hooks] skipped (not a git checkout?): ${err.message}`);
}

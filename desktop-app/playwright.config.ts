import { defineConfig } from '@playwright/test';

/**
 * End-to-end / smoke tests. These launch the *built* Electron app
 * (`out/main/index.js`), so run `npm run build` first — or use
 * `npm run test:e2e`, which builds then runs Playwright.
 *
 * Electron is driven serially: a single app instance per file, one worker.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // In CI also emit the HTML report so the workflow can upload it as an
  // artifact on failure (github + list alone write nothing to disk).
  reporter: process.env.CI
    ? [['github'], ['list'], ['html', { open: 'never' }]]
    : 'list',
  timeout: 60_000,
  expect: { timeout: 15_000 },
});

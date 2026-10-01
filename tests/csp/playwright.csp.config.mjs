import { defineConfig } from '@playwright/test';
import { resolve } from 'node:path';

// Dedicated configuration for the manual CSP verification. It is intentionally NOT the
// default `playwright.config.mjs`: `tests/csp/*.spec.mjs` must never be picked up by the PR
// CI path (`npm run test:e2e` → `playwright test`), which uses `testDir: './tests/e2e'`.
// The webServer spawns its own server on its own port, so a stale server started earlier
// without the candidate policy can never be reused.
const port = Number(process.env.GF_CSP_PORT || 4319);
// All output lands in the repository-level ignored `test-results/` tree; Playwright resolves
// relative paths against this config's directory, so these are absolute on purpose.
const outputRoot = resolve(import.meta.dirname, '..', '..', 'test-results');

export default defineConfig({
  // Paths resolve against this config's directory, so `'.'` means `tests/csp/`.
  testDir: '.',
  testMatch: '*.spec.mjs',
  fullyParallel: false,
  workers: 1,
  reporter: [['list'], ['json', { outputFile: resolve(outputRoot, 'csp-verification.json') }]],
  outputDir: resolve(outputRoot, 'csp'),
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    browserName: 'chromium',
    screenshot: 'only-on-failure',
  },
  webServer: {
    // Playwright runs this command with the config file's directory as cwd, so the path is
    // relative to `tests/csp/`, not to the repository root.
    command: 'node csp-serve.mjs',
    url: `http://127.0.0.1:${port}/`,
    reuseExistingServer: false,
    timeout: 30_000,
  },
});

import { defineConfig } from '@playwright/test';

/**
 * The browser journeys (e2e/), run against the production build: `npm run e2e` builds and runs them, `npm run e2e:run`
 * runs them against the last build. Playwright starts `next start` on E2E_PORT (3032) and stops it at the end; with
 * E2E_BASE_URL set it tests that server instead (a venue laptop's `npm start`, a preview URL) and starts none.
 */
const PORT = Number(process.env.E2E_PORT ?? 3032);
const BASE_URL = process.env.E2E_BASE_URL ?? `http://127.0.0.1:${PORT}`;

/**
 * WebGL in software (SwiftShader), on every system and in CI alike, so the view from the site draws the same way
 * everywhere, whatever the graphics card; slower than a GPU, hence the long timeouts on the pages that draw.
 */
const SOFTWARE_GL = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];

export default defineConfig({
  testDir: './e2e',
  outputDir: './test-results/e2e',
  timeout: 180_000,
  expect: { timeout: 30_000 },
  // Two pages at a time: the drawing pages are CPU-bound in software WebGL.
  workers: Number(process.env.E2E_WORKERS ?? 2),
  fullyParallel: true,
  retries: 0,
  forbidOnly: !!process.env.CI,
  reporter: [['list'], ['./e2e/results-reporter.ts']],
  use: {
    baseURL: BASE_URL,
    browserName: 'chromium',
    // English dates and the en-US order of a date box's fields (month, day, year), whatever the machine's language.
    locale: 'en-US',
    timezoneId: 'UTC',
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1,
    trace: 'off',
    screenshot: 'only-on-failure',
    launchOptions: {
      args: SOFTWARE_GL,
      // A Chromium of another version than this Playwright's, where `npx playwright install chromium` cannot run.
      ...(process.env.E2E_CHROMIUM ? { executablePath: process.env.E2E_CHROMIUM } : {}),
    },
  },
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: `npx next start -p ${PORT}`,
        url: `${BASE_URL}/sites`,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        stdout: 'ignore',
        stderr: 'pipe',
      },
});

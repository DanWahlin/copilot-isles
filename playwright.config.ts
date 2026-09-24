import { defineConfig } from '@playwright/test';

// Locally we use the installed Chrome (real GPU via ANGLE); CI uses Playwright's Chromium.
const local = !process.env.CI;

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    viewport: { width: 1600, height: 900 },
    ...(local
      ? { channel: 'chrome', launchOptions: { args: ['--use-angle=metal', '--ignore-gpu-blocklist'] } }
      : {}),
  },
  webServer: {
    command: 'npm run build && npm run preview',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: local,
    timeout: 120_000,
  },
});

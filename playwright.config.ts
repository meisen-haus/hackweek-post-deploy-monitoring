import {defineConfig, devices} from '@playwright/test';

export default defineConfig({
  testDir: 'tests',
  // Synthetic checks run against a real deploy over a network, and the
  // regression branch deliberately blocks the main thread for seconds.
  timeout: 120_000,
  expect: {timeout: 20_000},
  // A retry re-runs the browser against production, which is harmless here and
  // generates a little more telemetry.
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [['github'], ['list']] : [['list']],
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{name: 'chromium', use: {...devices['Desktop Chrome']}}],
});

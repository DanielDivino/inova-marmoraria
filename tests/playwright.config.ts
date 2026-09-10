import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';
const installed = '/home/daniel/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome';
if (!process.env.INOVA_TEST_SCHEMA?.startsWith('inova_test_')) throw new Error('Execute npm run test:e2e para usar o banco temporário.');
export default defineConfig({
  testDir: './e2e', workers: 1, fullyParallel: false, timeout: 60000, expect: { timeout: 15000 },
  reporter: [['list'], ['html', { outputFolder: '../.test-artifacts/report', open: 'never' }]],
  outputDir: '../.test-artifacts/results',
  use: { baseURL: process.env.INOVA_E2E_URL, trace: 'retain-on-failure', screenshot: 'only-on-failure', viewport: { width: 1440, height: 1000 }, launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ?? (existsSync(installed) ? installed : undefined) } },
});

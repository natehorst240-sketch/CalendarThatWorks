import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests-e2e',
  testMatch: ['**/*.spec.ts'],
  testIgnore: ['**/*.test.*', '**/__tests__/**', '**/node_modules/**'],
  timeout: 60_000,
  fullyParallel: false,
  retries: 0,
  reporter: [
    ['list'],
    ['json', { outputFile: 'qa-output/playwright-report.json' }],
    ['html', { outputFolder: 'qa-output/html-report', open: 'never' }]
  ],
  use: {
    baseURL: 'http://127.0.0.1:3000',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'off'
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://127.0.0.1:3000',
    reuseExistingServer: true,
    timeout: 120_000
  }
});

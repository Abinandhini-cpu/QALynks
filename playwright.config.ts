import { defineConfig } from '@playwright/test';

const API_PORT = 3101;
const WEB_PORT = 5174;

/**
 * End-to-end tests run against a dedicated SQLite file (data/e2e.db) that is
 * recreated and seeded on every run, so they never touch development data.
 * They use an installed system browser; set E2E_BROWSER_CHANNEL=chrome to switch.
 */
export default defineConfig({
  testDir: 'e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
  timeout: 60_000,
  use: {
    baseURL: `http://127.0.0.1:${WEB_PORT}`,
    channel: process.env.E2E_BROWSER_CHANNEL ?? 'msedge',
    acceptDownloads: true,
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      command: 'npm run db:reset -w @qalynks/api && npm run start -w @qalynks/api',
      url: `http://127.0.0.1:${API_PORT}/api/health`,
      env: { PORT: String(API_PORT), DATABASE_PATH: 'data/e2e.db', LOG_LEVEL: 'silent' },
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: 'npm run dev -w @qalynks/web',
      url: `http://127.0.0.1:${WEB_PORT}`,
      env: { WEB_PORT: String(WEB_PORT), API_URL: `http://127.0.0.1:${API_PORT}` },
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});

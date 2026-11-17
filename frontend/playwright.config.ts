import { defineConfig } from '@playwright/test'
import { resolve } from 'node:path'

// E2E runs against the REAL backend (fresh SQLite file, real migrations) and the production build
// served by `vite preview` (not the dev server). Browser: the installed, signed Microsoft Edge.
const root = resolve(import.meta.dirname, '..')
const dbFile = resolve(root, 'logs', 'e2e.db').replace(/\\/g, '/')
const python = resolve(root, 'backend', '.venv', 'Scripts', 'python.exe')

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    channel: 'msedge',
    viewport: { width: 1440, height: 900 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: [
    {
      command: `"${python}" -m cybertwin --port 8765 --database-url sqlite+aiosqlite:///${dbFile}`,
      cwd: resolve(root, 'backend'),
      url: 'http://127.0.0.1:8765/api/v1/health',
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: 'npx vite preview --host 127.0.0.1 --port 4173 --strictPort',
      url: 'http://127.0.0.1:4173',
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
})

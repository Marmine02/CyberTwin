import { defineConfig, devices } from "@playwright/test";
import { rmSync } from "node:fs";
import { resolve } from "node:path";

// Real backend (uvicorn) + real frontend (production build served by `vite preview`). No mocked API anywhere.
// Not the dev server: under a long full run `vite` (on-demand transforms, HMR websocket, file watcher) dropped
// mid-run; the preview server only serves static files + the /api proxy.
const BACKEND_PORT = 8765;
const FRONTEND_PORT = 5199;
const backendDir = resolve(import.meta.dirname, "../backend");
const frontendDir = resolve(import.meta.dirname, "../frontend");
const venvPython = resolve(backendDir, process.platform === "win32" ? ".venv/Scripts/python.exe" : ".venv/bin/python");
const dbFile = resolve(import.meta.dirname, ".e2e.db").replace(/\\/g, "/");
// fresh DB per run (main process only; workers re-evaluate this file while uvicorn holds the DB)
if (process.env.TEST_WORKER_INDEX === undefined) {
  for (const f of [dbFile, `${dbFile}-journal`]) rmSync(f, { force: true });
}

// E2E_DIAG=1 => preload diag/server-exit.cjs into the frontend server and log how it ends (logs/frontend-diag.log)
const diag = process.env.E2E_DIAG === "1";
const diagEnv: Record<string, string> = diag
  ? {
      NODE_OPTIONS: `--require ${resolve(import.meta.dirname, "diag/server-exit.cjs").replace(/\\/g, "/")}`,
      CT_DIAG_LOG: resolve(import.meta.dirname, "../logs/frontend-diag.log").replace(/\\/g, "/"),
    }
  : {};

// E2E_BASE_URL set => test an already running stack (e.g. docker compose on :8080); no local servers are started.
const external = process.env.E2E_BASE_URL;

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  retries: 0,
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  use: {
    ...devices["Desktop Chrome"],
    baseURL: external ?? `http://localhost:${FRONTEND_PORT}`,
    viewport: { width: 1440, height: 900 },
    trace: "retain-on-failure",
    // the guided demo starts on first launch; specs other than tour.spec.ts run as a returning user
    storageState: {
      cookies: [],
      origins: [{ origin: external ?? `http://localhost:${FRONTEND_PORT}`, localStorage: [{ name: "cybertwin.tour", value: "skipped" }] }],
    },
    screenshot: "only-on-failure",
  },
  webServer: external ? [] : [
    {
      // the venv's python directly (not `uv run`): on Windows Playwright only stops the direct child, and a
      // grandchild uvicorn would survive and keep the SQLite file locked for the next run
      command: `${venvPython} -m uvicorn app.main:app --host 127.0.0.1 --port ${BACKEND_PORT}`,
      cwd: backendDir,
      url: `http://127.0.0.1:${BACKEND_PORT}/api/v1/health`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        DATABASE_URL: `sqlite+aiosqlite:///${dbFile}`,
        CORS_ORIGINS: `http://localhost:${FRONTEND_PORT}`,
        AI_PROVIDER: process.env.E2E_AI_PROVIDER ?? "none",
        AI_MODEL: process.env.E2E_AI_MODEL ?? "",
        AI_BASE_URL: process.env.E2E_AI_BASE_URL ?? "",
        LOG_LEVEL: "WARNING",
      },
    },
    {
      command: `npx vite build && npx vite preview --port ${FRONTEND_PORT} --strictPort`,
      cwd: frontendDir,
      url: `http://localhost:${FRONTEND_PORT}`,
      reuseExistingServer: false,
      timeout: 180_000,
      stdout: diag ? "pipe" : "ignore",
      env: { CT_BACKEND_URL: `http://127.0.0.1:${BACKEND_PORT}`, CT_FRONTEND_PORT: String(FRONTEND_PORT), ...diagEnv },
    },
  ],
});

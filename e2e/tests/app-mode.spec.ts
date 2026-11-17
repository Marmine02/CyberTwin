import { expect, test } from "@playwright/test";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { rmSync } from "node:fs";
import { resolve } from "node:path";

// Single-process app mode (what scripts/CyberTwin.ps1 runs): ONE uvicorn serves the API and the built UI
// (FRONTEND_DIST=frontend/dist). No vite, no nginx. frontend/dist is built by the webServer step of the config.
const PORT = 8767;
const APP = `http://127.0.0.1:${PORT}`;
const backendDir = resolve(import.meta.dirname, "../../backend");
const python = resolve(backendDir, process.platform === "win32" ? ".venv/Scripts/python.exe" : ".venv/bin/python");
const dbFile = resolve(import.meta.dirname, "../.app-mode.db").replace(/\\/g, "/");
let server: ChildProcess | undefined;

test.skip(!!process.env.E2E_BASE_URL, "app mode starts its own local backend; not applicable to an external stack");
test.describe.configure({ mode: "serial" });
test.use({ baseURL: APP });

test.beforeAll(async () => {
  test.setTimeout(120_000);
  for (const f of [dbFile, `${dbFile}-journal`]) rmSync(f, { force: true });
  server = spawn(python, ["-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", String(PORT)], {
    cwd: backendDir,
    stdio: "ignore",
    env: {
      ...process.env,
      FRONTEND_DIST: resolve(import.meta.dirname, "../../frontend/dist"),
      DATABASE_URL: `sqlite+aiosqlite:///${dbFile}`,
      CORS_ORIGINS: APP,
      AI_PROVIDER: "none",
      LOG_LEVEL: "WARNING",
    },
  });
  await expect
    .poll(async () => (await fetch(`${APP}/api/v1/health`).catch(() => null))?.status ?? 0, { timeout: 90_000 })
    .toBe(200);
});

test.afterAll(() => {
  if (server?.pid === undefined) return;
  if (process.platform === "win32") spawnSync(`taskkill /pid ${server.pid} /T /F`, { shell: true, stdio: "ignore" });
  else server.kill();
  for (const f of [dbFile, `${dbFile}-journal`]) rmSync(f, { force: true });
});

test("one process serves UI + API: demo flow to score 100, deep link survives reload", async ({ page }) => {
  const origins = new Set<string>();
  page.on("request", (r) => origins.add(new URL(r.url()).origin));
  await page.addInitScript(() => {
    localStorage.setItem("cybertwin.lang", "en");
    localStorage.setItem("cybertwin.tour", "skipped");
  });

  await page.goto("/");
  await expect(page).toHaveTitle("CyberTwin");
  await expect(page.getByTestId("panel-topology")).toBeVisible();
  await page.getByTestId("reset-demo").click();
  await page.getByTestId("confirm-button").click();
  await expect(page.getByTestId("toast").filter({ hasText: "Demo restored" })).toBeVisible();

  await page.goto("/simulate");
  await page.getByTestId("scenario-sensitive_data_exposure").click();
  await page.getByTestId("run-simulation").click();
  const done = page.getByTestId("toast").filter({ hasText: "on r1 finished" });
  await done.getByRole("button", { name: "Open the result" }).click();
  await expect(page.getByTestId("sim-score")).toHaveText(/^\s*25\s*$/);

  await page.goto("/remediation?scenario=sensitive_data_exposure");
  await page.getByTestId("select-top3").click();
  await page.getByTestId("apply-selected").click();
  await page.getByTestId("confirm-button").click();
  await expect(page.getByTestId("after-score").locator("[data-value]")).toHaveAttribute("data-value", "100");

  // a client-side route loaded directly from the backend (SPA fallback), not via vite
  await page.reload();
  await expect(page.getByTestId("panel-comparison")).toBeVisible();
  expect([...origins].filter((o) => o.startsWith("http"))).toEqual([APP]);

  // the API is unchanged next to the UI
  const unknown = await page.request.get(`${APP}/api/v1/no-such-route`);
  expect(unknown.status()).toBe(404);
  expect((await unknown.json()).error.code).toBe("not_found");
});

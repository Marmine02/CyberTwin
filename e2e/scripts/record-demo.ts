// Records the README demo video (not part of the test suite).
//
//   cd e2e && node scripts/record-demo.ts
//
// Starts its own real stack (uvicorn + `vite build && vite preview`, fresh SQLite file, ports 8766 / 5198 so it never
// collides with the E2E suite), drives the UI with Playwright at 1440x900 with video recording on, then stops both
// servers. Output: docs/media/demo-raw.webm + demo-raw.json with the offset (seconds) where the demo starts:
//
//   demo.mp4 and demo.gif <- demo-raw.webm; exact ffmpeg commands: docs/media/README.md
import { chromium, expect, type Page } from "@playwright/test";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const BACKEND_PORT = 8766;
const FRONTEND_PORT = 5198;
const root = resolve(import.meta.dirname, "../..");
const backendDir = resolve(root, "backend");
const frontendDir = resolve(root, "frontend");
const outDir = resolve(root, "docs/media");
const python = resolve(backendDir, process.platform === "win32" ? ".venv/Scripts/python.exe" : ".venv/bin/python");
const dbFile = resolve(import.meta.dirname, ".demo.db").replace(/\\/g, "/");
const BASE = `http://localhost:${FRONTEND_PORT}`;

function start(command: string, cwd: string, env: Record<string, string>): ChildProcess {
  return spawn(command, { cwd, shell: true, stdio: "ignore", env: { ...process.env, ...env } });
}

function stop(p: ChildProcess) {
  if (p.pid === undefined) return;
  if (process.platform === "win32") spawnSync(`taskkill /pid ${p.pid} /T /F`, { shell: true, stdio: "ignore" });
  else process.kill(-p.pid, "SIGTERM");
}

async function waitFor(url: string, timeoutMs: number) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`${url} did not come up within ${timeoutMs / 1000}s`);
}

const pause = (page: Page, ms: number) => page.waitForTimeout(ms);

async function demo(page: Page) {
  // ---- Overview (already loaded by main), then reset the demo from the top bar
  await pause(page, 2500);
  await page.getByTestId("reset-demo").click();
  await pause(page, 700);
  await page.getByTestId("confirm-button").click();
  await expect(page.getByTestId("toast").filter({ hasText: "Demo restored" })).toBeVisible();
  await pause(page, 1500);

  // ---- Attack Simulation: run Sensitive Data Exposure, replay the attack path
  await page.getByRole("link", { name: /Attack Simulation/ }).click();
  await expect(page.getByTestId("scenario-sensitive_data_exposure")).toBeVisible();
  await pause(page, 1200);
  await page.getByTestId("scenario-sensitive_data_exposure").click();
  await pause(page, 600);
  await page.getByTestId("run-simulation").click();
  const done = page.getByTestId("toast").filter({ hasText: "on r1 finished" });
  await expect(done).toBeVisible();
  // the replay plays by itself after the run; watch a few steps at 1x, then speed up to the end
  await pause(page, 6000);
  await page.getByRole("group", { name: /speed/i }).getByRole("button", { name: "4x" }).click();
  await expect(page.getByTestId("replay-pos")).toHaveText(/^(\d+)\/\1$/, { timeout: 30_000 }); // until the last event
  await pause(page, 1500);

  // ---- Remediation: apply the top 3 fixes, before / after
  await page.goto("/remediation?scenario=sensitive_data_exposure");
  await expect(page.getByTestId("rec-list")).toBeVisible();
  await page.waitForLoadState("networkidle");
  await pause(page, 1800);
  await page.getByTestId("select-top3").click();
  await pause(page, 1000);
  await page.getByTestId("apply-selected").click();
  await pause(page, 900);
  await page.getByTestId("confirm-button").click();
  await expect(page.getByTestId("panel-comparison")).toBeVisible();
  await expect(page.getByTestId("blocked-paths")).toContainText("Internet");
  await pause(page, 4500);
}

async function main() {
  mkdirSync(outDir, { recursive: true });
  for (const f of [dbFile, `${dbFile}-journal`]) rmSync(f, { force: true });
  const backend = start(`"${python}" -m uvicorn app.main:app --host 127.0.0.1 --port ${BACKEND_PORT}`, backendDir, {
    DATABASE_URL: `sqlite+aiosqlite:///${dbFile}`,
    CORS_ORIGINS: BASE,
    AI_PROVIDER: "none",
    LOG_LEVEL: "WARNING",
  });
  const frontend = start(`npx vite build && npx vite preview --port ${FRONTEND_PORT} --strictPort`, frontendDir, {
    CT_BACKEND_URL: `http://127.0.0.1:${BACKEND_PORT}`,
    CT_FRONTEND_PORT: String(FRONTEND_PORT),
  });
  try {
    await waitFor(`http://127.0.0.1:${BACKEND_PORT}/api/v1/health`, 120_000);
    await waitFor(BASE, 180_000);

    const browser = await chromium.launch();
    const size = { width: 1440, height: 900 };
    const context = await browser.newContext({
      baseURL: BASE,
      viewport: size,
      recordVideo: { dir: outDir, size },
    });
    await context.addInitScript(() => {
      localStorage.setItem("cybertwin.lang", "en");
      localStorage.setItem("cybertwin.tour", "skipped");
    });
    const page = await context.newPage();
    const t0 = Date.now(); // video starts with the page
    // the first paint of the app falls in the trimmed lead-in
    await page.goto("/");
    await expect(page.getByTestId("panel-topology")).toBeVisible();
    await page.waitForLoadState("networkidle");
    const startOffset = (Date.now() - t0) / 1000;
    const tDemo = Date.now();
    await demo(page);
    const duration = (Date.now() - tDemo) / 1000;
    const video = page.video();
    await context.close(); // flushes the video
    await browser.close();
    const raw = resolve(outDir, "demo-raw.webm");
    rmSync(raw, { force: true });
    renameSync(await video!.path(), raw);
    const info = { raw: "docs/media/demo-raw.webm", startOffset: Number(startOffset.toFixed(2)), duration: Number(duration.toFixed(2)) };
    writeFileSync(resolve(outDir, "demo-raw.json"), JSON.stringify(info, null, 2));
    console.log(JSON.stringify(info));
  } finally {
    stop(frontend);
    stop(backend);
    for (const f of [dbFile, `${dbFile}-journal`]) rmSync(f, { force: true });
  }
}

await main();

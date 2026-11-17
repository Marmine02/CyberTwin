// Real-path check of the desktop launcher (Windows; not part of the test suite).
//
//   cd e2e && node scripts/verify-desktop.ts [screenshot.png]
//
// Starts scripts/CyberTwin.ps1 exactly as the shortcut does (plus -DebugPort), attaches Playwright to the Edge/Chrome
// app window the launcher opened (connectOverCDP), checks the window title, runs the demo flow (reset -> simulate ->
// apply top 3 fixes -> score 100), closes the window like a user, and asserts that the launcher stopped the backend:
// no uvicorn of this repo left, port closed, state file removed.
import { chromium, expect } from "@playwright/test";
import { execFileSync, spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const DEBUG_PORT = 9333;
const root = resolve(import.meta.dirname, "../..");
const launcher = resolve(root, "scripts/CyberTwin.ps1");
const stateFile = resolve(process.env.LOCALAPPDATA ?? "", "CyberTwin/backend.json");
const shot = process.argv[2];

const ps = (cmd: string) =>
  execFileSync("powershell.exe", ["-NoProfile", "-Command", cmd], { encoding: "utf8" }).trim();
const step = (msg: string) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${msg}`);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function until<T>(what: string, fn: () => Promise<T | undefined> | T | undefined, timeoutMs: number): Promise<T> {
  const end = Date.now() + timeoutMs;
  for (;;) {
    const v = await fn();
    if (v !== undefined) return v;
    if (Date.now() > end) throw new Error(`timeout: ${what}`);
    await sleep(500);
  }
}

const backendProcs = () =>
  ps(
    `@(Get-CimInstance Win32_Process -Filter "Name='python.exe'" | Where-Object { $_.CommandLine -match 'uvicorn' -and $_.CommandLine -match '--app-dir' -and $_.CommandLine -match [regex]::Escape('${resolve(root, "backend").replace(/\\/g, "\\\\")}') }).Count`,
  );

step("starting launcher");
const t0 = Date.now();
const proc = spawn("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", launcher, "-DebugPort", String(DEBUG_PORT)], {
  stdio: ["ignore", "pipe", "pipe"],
});
let launcherOut = "";
proc.stdout.on("data", (d) => (launcherOut += d));
proc.stderr.on("data", (d) => (launcherOut += d));
let exited = false;
proc.on("exit", () => (exited = true));

await until(
  "app window (CDP endpoint)",
  async () => {
    if (exited) throw new Error(`launcher exited early:\n${launcherOut}`);
    try {
      return (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/version`)).ok ? true : undefined;
    } catch {
      return undefined;
    }
  },
  300_000,
);
step(`app window up after ${((Date.now() - t0) / 1000).toFixed(1)} s`);
const state = JSON.parse(readFileSync(stateFile, "utf8").replace(/^﻿/, "")) as { url: string; backend: number };
step(`backend ${state.url} (pid ${state.backend}); launcher said: ${launcherOut.trim().split("\n").pop()}`);

const browser = await chromium.connectOverCDP(`http://127.0.0.1:${DEBUG_PORT}`);
const page = await until("app page", () => browser.contexts().flatMap((c) => c.pages()).find((p) => p.url().startsWith(state.url)), 30_000);
await page.addInitScript(() => localStorage.setItem("cybertwin.lang", "en"));
await page.evaluate(() => {
  localStorage.setItem("cybertwin.lang", "en");
  localStorage.setItem("cybertwin.tour", "skipped");
});
await page.reload();
await expect(page.getByTestId("panel-topology")).toBeVisible({ timeout: 30_000 });
expect(await page.title()).toBe("CyberTwin");
const windowTitle = ps(
  `(Get-Process msedge, chrome -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowTitle -like 'CyberTwin*' } | Select-Object -First 1).MainWindowTitle`,
);
step(`document title "${await page.title()}", OS window title "${windowTitle}"`);

// ---- demo flow in the real window
await page.getByTestId("reset-demo").click();
await page.getByTestId("confirm-button").click();
await expect(page.getByTestId("toast").filter({ hasText: "Demo restored" })).toBeVisible();
await page.goto(`${state.url}/simulate`);
await page.getByTestId("scenario-sensitive_data_exposure").click();
await page.getByTestId("run-simulation").click();
const done = page.getByTestId("toast").filter({ hasText: "on r1 finished" });
await expect(done).toBeVisible();
await done.getByRole("button", { name: "Open the result" }).click();
const before = Number(((await page.getByTestId("sim-score").textContent()) ?? "").trim());
await page.goto(`${state.url}/remediation?scenario=sensitive_data_exposure`);
await page.getByTestId("select-top3").click();
await page.getByTestId("apply-selected").click();
await page.getByTestId("confirm-button").click();
await expect(page.getByTestId("after-score").locator("[data-value]")).toHaveAttribute("data-value", "100");
const blocked = Number(await page.getByTestId("blocked-count").textContent());
step(`demo flow: score ${before} -> 100, ${blocked} paths blocked`);
await page.reload(); // SPA fallback: a client-side route survives a reload from the backend
await expect(page.getByTestId("panel-comparison")).toBeVisible();

if (shot) {
  ps(`Add-Type -AssemblyName System.Windows.Forms, System.Drawing; $b = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds; $bmp = New-Object System.Drawing.Bitmap $b.Width, $b.Height; $g = [System.Drawing.Graphics]::FromImage($bmp); $g.CopyFromScreen($b.Location, [System.Drawing.Point]::Empty, $b.Size); $bmp.Save('${shot}')`);
  step(`desktop screenshot: ${shot}`);
}

// ---- close the window like a user (last page closes the app window)
step("closing the app window");
await page.close({ runBeforeUnload: false });
await until("launcher exit", () => (exited ? true : undefined), 60_000);
step("launcher exited");
const left = backendProcs();
const listening = ps(`@(Get-NetTCPConnection -LocalPort ${new URL(state.url).port} -State Listen -ErrorAction SilentlyContinue).Count`);
step(`uvicorn processes of this repo left: ${left}; listeners on ${new URL(state.url).port}: ${listening}; state file present: ${existsSync(stateFile)}`);
if (left !== "0" || listening !== "0" || existsSync(stateFile)) throw new Error("backend was not stopped cleanly");
console.log("DESKTOP CHECK PASSED");

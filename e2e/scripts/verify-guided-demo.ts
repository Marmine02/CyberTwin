// Real-path check of the guided demo through the desktop launcher (Windows; not part of the test suite).
//
//   cd e2e && node scripts/verify-guided-demo.ts [outDir]
//
// Starts scripts/CyberTwin.ps1 (with -DebugPort), attaches to the Edge/Chrome app window over CDP and, for EN, TR and
// AZ in turn: resets the demo, clears the "tour seen" flag (= first launch), and walks the five steps on the real
// UI with real actions (run, replay, apply), asserting each hint's text in that language and saving a screenshot
// per step. Then closes the window and checks that the launcher stopped the backend.
import { chromium, expect, type Page } from "@playwright/test";
import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import az from "../../frontend/src/i18n/az.ts";
import en from "../../frontend/src/i18n/en.ts";
import tr from "../../frontend/src/i18n/tr.ts";

const DEBUG_PORT = 9335;
const root = resolve(import.meta.dirname, "../..");
const outDir = resolve(process.argv[2] ?? resolve(root, "docs/ux/after/guided"));
mkdirSync(outDir, { recursive: true });
const stateFile = resolve(process.env.LOCALAPPDATA ?? "", "CyberTwin/backend.json");
const ps = (cmd: string) => execFileSync("powershell.exe", ["-NoProfile", "-Command", cmd], { encoding: "utf8" }).trim();
const step = (msg: string) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${msg}`);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until<T>(what: string, fn: () => Promise<T | undefined> | T | undefined, ms: number): Promise<T> {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v !== undefined) return v;
    if (Date.now() > end) throw new Error(`timeout: ${what}`);
    await sleep(400);
  }
}

const proc = spawn("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", resolve(root, "scripts/CyberTwin.ps1"), "-DebugPort", String(DEBUG_PORT)], {
  stdio: ["ignore", "pipe", "pipe"],
  env: { ...process.env, CYBERTWIN_NO_DIALOG: "1" }, // errors on the console, not in a blocking message box
});
let launcherOut = "";
proc.stdout.on("data", (d) => (launcherOut += d));
proc.stderr.on("data", (d) => (launcherOut += d));
let exited = false;
proc.on("exit", () => (exited = true));
await until("app window", async () => {
  if (exited) throw new Error(`launcher exited early:
${launcherOut}`);
  try {
    return (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/version`)).ok ? true : undefined;
  } catch {
    return undefined;
  }
}, 300_000);
const state = JSON.parse(readFileSync(stateFile, "utf8").replace(/^﻿/, "")) as { url: string };
const browser = await chromium.connectOverCDP(`http://127.0.0.1:${DEBUG_PORT}`);
const page: Page = await until("app page", () => browser.contexts().flatMap((c) => c.pages()).find((p) => p.url().startsWith(state.url)), 30_000);
await page.setViewportSize({ width: 1440, height: 900 }).catch(() => undefined);
step(`launcher up: ${state.url}`);
expect.configure({ timeout: 20_000 });

for (const [lang, res] of [["en", en], ["tr", tr], ["az", az]] as const) {
  // first launch in this language: no "tour seen" flag, fresh demo
  await page.evaluate((l) => {
    localStorage.setItem("cybertwin.lang", l);
    localStorage.removeItem("cybertwin.tour");
    localStorage.removeItem("cybertwin.ui.v1");
  }, lang);
  const reset = await page.request.post(`${state.url}/api/v1/demo/reset`);
  expect(reset.ok()).toBeTruthy();
  await page.goto(`${state.url}/`);
  const tour = page.getByTestId("tour");
  const shot = (n: number) => page.screenshot({ path: resolve(outDir, `${lang}-step${n + 1}.png`) });

  await expect(tour).toHaveAttribute("data-step", "0");
  await expect(tour).toContainText(res.tour.s0.title);
  await sleep(700);
  await shot(0);
  await page.getByTestId("tour-next").click();

  await expect(page).toHaveURL(/\/simulate$/);
  await expect(tour).toHaveAttribute("data-step", "1");
  await expect(tour).toContainText(res.tour.s1.title);
  await expect(page.getByTestId("scenario-sensitive_data_exposure")).toHaveAttribute("aria-checked", "true");
  await sleep(500);
  await shot(1);
  await page.getByTestId("run-simulation").click();

  await expect(tour).toHaveAttribute("data-step", "2");
  await expect(tour).toContainText(res.tour.s2.title);
  await sleep(3000); // a few real replay steps at 1x
  await expect(page.getByTestId("narration-headline")).toBeVisible();
  await shot(2);
  await page.getByRole("group", { name: res.sim.speed }).getByRole("button", { name: "4x" }).click();
  await expect(tour).toHaveAttribute("data-step", "3", { timeout: 40_000 });

  await expect(page).toHaveURL(/\/remediation\?scenario=sensitive_data_exposure/);
  await expect(tour).toContainText(res.tour.s3.title);
  await sleep(700);
  await shot(3);
  await page.getByTestId("select-top3").click();
  await page.getByTestId("apply-selected").click();
  await page.getByTestId("confirm-button").click();

  await expect(tour).toHaveAttribute("data-step", "4");
  await expect(tour).toContainText(res.tour.s4.title);
  await expect(page.getByTestId("after-score").locator("[data-value]")).toHaveAttribute("data-value", "100");
  await sleep(1200);
  await shot(4);
  await page.getByTestId("tour-finish").click();
  await expect(tour).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem("cybertwin.tour"))).toBe("done");
  await page.goto(`${state.url}/`);
  await sleep(800);
  await expect(tour).toHaveCount(0);
  step(`${lang}: guided demo 5/5 steps on the real UI, score 25 -> 100, "done" remembered`);
}

await page.evaluate(() => localStorage.setItem("cybertwin.lang", "en"));
step("closing the app window");
await page.close({ runBeforeUnload: false });
await until("launcher exit", () => (exited ? true : undefined), 60_000);
const port = new URL(state.url).port;
const listening = ps(`@(Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue).Count`);
step(`launcher exited; listeners on ${port}: ${listening}; state file present: ${existsSync(stateFile)}`);
if (listening !== "0" || existsSync(stateFile)) throw new Error("backend was not stopped cleanly");
console.log("GUIDED DEMO CHECK PASSED (EN, TR, AZ)");
process.exit(0);

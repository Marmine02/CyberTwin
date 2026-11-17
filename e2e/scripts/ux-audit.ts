// UX audit driver (not a test): runs the REAL desktop launcher (scripts/CyberTwin.ps1 -DebugPort), attaches to the
// app window over CDP and walks all 8 pages as a first-time user would, from a reset demo and from a remediated
// revision. Writes screenshots to <outDir> and a JSON log of observations (timings, visible state) to <outDir>/audit.json.
//
//   cd e2e && node scripts/ux-audit.ts ../docs/ux/before [en|tr|az]
import { chromium, type Page } from "@playwright/test";
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const DEBUG_PORT = 9334;
const root = resolve(import.meta.dirname, "../..");
const outDir = resolve(process.argv[2] ?? resolve(root, "docs/ux/before"));
const lang = process.argv[3] ?? "en";
mkdirSync(outDir, { recursive: true });
const stateFile = resolve(process.env.LOCALAPPDATA ?? "", "CyberTwin/backend.json");
const log: Record<string, unknown>[] = [];
const note = (id: string, data: Record<string, unknown>) => {
  log.push({ id, ...data });
  console.log(`[${id}] ${JSON.stringify(data)}`);
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function until<T>(fn: () => Promise<T | undefined> | T | undefined, ms: number): Promise<T> {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v !== undefined) return v;
    if (Date.now() > end) throw new Error("timeout");
    await sleep(300);
  }
}

const proc = spawn("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", resolve(root, "scripts/CyberTwin.ps1"), "-DebugPort", String(DEBUG_PORT)], { stdio: "ignore" });
await until(async () => {
  try {
    return (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/version`)).ok ? true : undefined;
  } catch {
    return undefined;
  }
}, 300_000);
const state = JSON.parse(readFileSync(stateFile, "utf8").replace(/^﻿/, "")) as { url: string };
const browser = await chromium.connectOverCDP(`http://127.0.0.1:${DEBUG_PORT}`);
const page: Page = await until(() => browser.contexts().flatMap((c) => c.pages()).find((p) => p.url().startsWith(state.url)), 30_000);
await page.setViewportSize({ width: 1440, height: 900 }).catch(() => undefined);
await page.evaluate((l) => localStorage.setItem("cybertwin.lang", l), lang);
const base = state.url;
let n = 0;
const shot = async (name: string, full = false) => {
  const f = `${String(++n).padStart(2, "0")}-${name}.png`;
  await page.screenshot({ path: resolve(outDir, f), fullPage: full });
  return f;
};
const go = async (path: string) => {
  await page.goto(`${base}${path}`);
  await page.waitForLoadState("networkidle").catch(() => undefined);
  await sleep(900);
};
const step = async (id: string, fn: () => Promise<void>) => {
  try {
    await fn();
  } catch (e) {
    note(id, { error: String(e).slice(0, 300) });
  }
};
const text = async (sel: string) => ((await page.locator(sel).first().textContent().catch(() => null)) ?? "").trim();

await go("/");
await step("reset", async () => {
  await page.getByTestId("reset-demo").click();
  await page.getByTestId("confirm-button").click();
  await page.getByTestId("toast").first().waitFor();
  note("reset", { toast: await text("[data-testid=toast]") });
});
// let first-run state settle: no simulation yet
await page.evaluate(() => localStorage.removeItem("cybertwin.ui.v1"));

for (const [route, name] of [["/", "overview"], ["/map", "map"], ["/assets", "assets"], ["/simulate", "simulate"], ["/vulnerabilities", "vulns"], ["/assistant", "assistant"], ["/remediation", "remediation"], ["/reports", "reports"]] as const) {
  await step(`fresh-${name}`, async () => {
    await go(route);
    const f = await shot(`fresh-${name}`);
    const buttons = await page.locator("main button:visible").evaluateAll((bs) => bs.map((b) => `${(b.textContent ?? "").trim().slice(0, 30)}${(b as HTMLButtonElement).disabled ? " [disabled]" : ""}`));
    const empty = await page.locator("main").innerText();
    note(`fresh-${name}`, { shot: f, buttons, textSample: empty.replace(/\s+/g, " ").slice(0, 400) });
  });
}

// ---- simulation: run, what does a user see?
await step("sim-run", async () => {
  await go("/simulate");
  await page.getByTestId("scenario-sensitive_data_exposure").click();
  const t0 = Date.now();
  await page.getByTestId("run-simulation").click();
  await page.getByTestId("toast").filter({ hasText: /.+/ }).first().waitFor();
  const dt = Date.now() - t0;
  await sleep(150);
  const f1 = await shot("sim-after-run-click");
  note("sim-run", { msUntilToast: dt, toast: await text("[data-testid=toast]"), replayPosAfterRun: await text("[data-testid=replay-pos]"), sameUrl: page.url() });
  await page.getByTestId("toast").getByRole("button").first().click().catch(() => undefined);
  await sleep(1200);
  const f2 = await shot("sim-inspect-results");
  note("sim-inspect", { shots: [f1, f2], replayPos: await text("[data-testid=replay-pos]"), score: await text("[data-testid=sim-score]"), url: page.url() });
  const f3 = await shot("sim-inspect-full", true);
  note("sim-inspect-full", { shot: f3 });
});

await step("replay-play", async () => {
  const t0 = Date.now();
  await page.getByTestId("replay-toggle").click();
  await sleep(300);
  const pos1 = await text("[data-testid=replay-pos]");
  await shot("replay-playing-early");
  await until(async () => ((await page.getByTestId("replay-toggle").textContent()) ?? "").match(/Play|Oynat|Oyna/) ? true : undefined, 120_000);
  note("replay-play", { posEarly: pos1, msToFinish: Date.now() - t0, posEnd: await text("[data-testid=replay-pos]") });
});

await step("eventlog", async () => {
  const items = await page.locator("[data-testid=panel-eventlog] li").evaluateAll((ls) => ls.slice(0, 6).map((l) => {
    const s = l.querySelector("span.truncate") as HTMLElement | null;
    return { text: s?.textContent ?? "", truncated: s ? s.scrollWidth > s.clientWidth : false };
  }));
  await page.getByTestId("panel-eventlog").screenshot({ path: resolve(outDir, `${String(++n).padStart(2, "0")}-eventlog.png`) });
  note("eventlog", { items });
});

await step("map-clip", async () => {
  // are any nodes outside the visible map viewport?
  const clip = await page.evaluate(() => {
    const m = document.querySelector("[data-testid=sim-map]")?.getBoundingClientRect();
    if (!m) return null;
    return [...document.querySelectorAll("[data-testid^=node-]")].map((n) => {
      const r = n.getBoundingClientRect();
      return { id: n.getAttribute("data-testid"), clipped: r.left < m.left || r.right > m.right || r.top < m.top || r.bottom + 30 > m.bottom };
    }).filter((x) => x.clipped);
  });
  const attribution = await page.locator(".react-flow__attribution:visible").count();
  note("map-clip", { clippedNodes: clip, attributionVisible: attribution });
});

await step("map-page", async () => {
  await go("/map");
  await page.locator("[data-testid^=node-]").first().click();
  await sleep(500);
  const f = await shot("map-node-selected");
  note("map-page", { shot: f });
  await page.locator("[data-testid^=zone-]").nth(2).click().catch(() => undefined);
  await sleep(700);
  note("map-zone", { shot: await shot("map-zone-filter") });
});

await step("overview-after-run", async () => {
  await go("/");
  note("overview-after-run", { shot: await shot("overview-after-run") });
});

await step("assistant", async () => {
  await go("/assistant");
  note("assistant", { shot: await shot("assistant-after-run") });
});

// ---- remediation: apply top 3
await step("remed", async () => {
  await go("/remediation?scenario=sensitive_data_exposure");
  note("remed-before", { shot: await shot("remediation-before-apply", true) });
  await page.getByTestId("select-top3").click();
  const t0 = Date.now();
  await page.getByTestId("apply-selected").click();
  await page.getByTestId("confirm-button").click();
  await page.getByTestId("after-score").waitFor();
  note("remed-apply", { ms: Date.now() - t0, toast: await text("[data-testid=toast]"), shot: await shot("remediation-after-apply", true) });
});

// ---- the user's screenshot: r2, Outdated Service Exploitation, in TR
await step("r2-sim", async () => {
  await page.evaluate(() => localStorage.setItem("cybertwin.lang", "tr"));
  await go("/simulate");
  await page.getByTestId("scenario-outdated_service_exploitation").click();
  await page.getByTestId("run-simulation").click();
  await page.getByTestId("toast").filter({ hasText: /.+/ }).first().waitFor();
  await page.getByTestId("toast").last().getByRole("button").first().click().catch(() => undefined);
  await sleep(1500);
  note("r2-sim", { shot: await shot("r2-sim-outdated-tr"), score: await text("[data-testid=sim-score]"), pos: await text("[data-testid=replay-pos]"), rev: await text("[data-testid=sim-revision]") });
  await page.evaluate((l) => localStorage.setItem("cybertwin.lang", l), lang);
});

for (const [route, name] of [["/", "overview"], ["/map", "map"], ["/assets", "assets"], ["/simulate", "simulate"], ["/vulnerabilities", "vulns"], ["/assistant", "assistant"], ["/remediation", "remediation"], ["/reports", "reports"]] as const) {
  await step(`r2-${name}`, async () => {
    await go(route);
    note(`r2-${name}`, { shot: await shot(`r2-${name}`) });
  });
}

// keyboard: tab order on the sim page
await step("keyboard", async () => {
  await go("/simulate");
  const seq: string[] = [];
  for (let i = 0; i < 14; i++) {
    await page.keyboard.press("Tab");
    seq.push(await page.evaluate(() => {
      const e = document.activeElement as HTMLElement | null;
      return `${e?.tagName}:${(e?.getAttribute("aria-label") ?? e?.textContent ?? "").trim().slice(0, 24)}`;
    }));
  }
  note("keyboard", { tabOrder: seq });
});

writeFileSync(resolve(outDir, "audit.json"), JSON.stringify(log, null, 2));
await page.close({ runBeforeUnload: false });
await sleep(4000);
console.log("AUDIT DONE");
process.exit(0);

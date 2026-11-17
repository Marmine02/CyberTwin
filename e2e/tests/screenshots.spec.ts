import { expect, test } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { API, resetDemoApi } from "./env";

const OUT = resolve(import.meta.dirname, "../../docs/screenshots");
mkdirSync(OUT, { recursive: true });

const PAGES = [
  { path: "/", name: "01-overview", ready: "panel-topology" },
  { path: "/map", name: "02-network-map", ready: "network-map" },
  { path: "/assets", name: "03-assets", ready: "asset-table" },
  { path: "/simulate", name: "04-attack-simulation", ready: "panel-paths" },
  { path: "/vulnerabilities", name: "05-vulnerabilities", ready: "vuln-table" },
  { path: "/assistant", name: "06-ai-assistant", ready: "panel-chat" },
  { path: "/remediation", name: "07-remediation", ready: "panel-recs" },
  { path: "/reports", name: "08-reports", ready: "history-table" },
];

test.describe.configure({ mode: "serial" });

test.beforeAll(async ({ request }) => {
  const api = API;
  await resetDemoApi(request);
  // a little real history: run, apply one fix, run again
  for (const scenario of ["outdated_service_exploitation", "credential_compromise", "sensitive_data_exposure"]) {
    expect((await request.post(`${api}/simulations`, { data: { twin_id: "northwind", scenario } })).ok()).toBeTruthy();
  }
});

for (const lang of ["en", "tr"] as const) {
  for (const p of PAGES) {
    test(`${lang} ${p.name}`, async ({ page }) => {
      await page.addInitScript((l) => localStorage.setItem("cybertwin.lang", l), lang);
      await page.goto(p.path);
      await expect(page.getByTestId(p.ready)).toBeVisible();
      await page.waitForLoadState("networkidle");
      if (p.path === "/assistant") await expect(page.getByTestId("ai-mode")).toBeVisible();
      await page.waitForTimeout(1200); // let count-ups and fit-view settle
      await page.screenshot({ path: `${OUT}/${p.name}-${lang}.png`, fullPage: false });
    });
  }
}

test("after remediation: comparison + residual exposure (EN, TR)", async ({ page, request }) => {
  const api = API;
  const recs = await (await request.get(`${api}/recommendations?twin=northwind&scenario=sensitive_data_exposure`)).json();
  const out = await request.post(`${api}/remediations/apply`, {
    data: { twin_id: "northwind", scenario: "sensitive_data_exposure", actions: recs.recommendations.slice(0, 3).map((r: { action: unknown }) => r.action) },
  });
  expect(out.ok()).toBeTruthy();
  for (const lang of ["en", "tr"] as const) {
    await page.addInitScript((l) => localStorage.setItem("cybertwin.lang", l), lang);
    await page.goto("/remediation?scenario=sensitive_data_exposure");
    await expect(page.getByTestId("remed-residual").getByTestId("residual-list")).toBeVisible();
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1500);
    await page.getByTestId("panel-comparison").scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${OUT}/10-remediation-after-${lang}.png`, fullPage: false });
  }
});

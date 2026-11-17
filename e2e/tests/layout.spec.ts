import { expect, test } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { API, resetDemoApi } from "./env";

// Layout at 1024, 1280 and 1440 px widths, all 8 pages. Asserts no horizontal page scroll and no panel
// whose content is wider than the panel; saves screenshots to docs/screenshots/layout/ for review.

const OUT = resolve(import.meta.dirname, "../../docs/screenshots/layout");
mkdirSync(OUT, { recursive: true });
const PAGES = [
  { path: "/", name: "overview", ready: "panel-residual" },
  { path: "/map", name: "network-map", ready: "network-map" },
  { path: "/assets", name: "assets", ready: "asset-table" },
  { path: "/simulate", name: "attack-simulation", ready: "panel-paths" },
  { path: "/vulnerabilities", name: "vulnerabilities", ready: "vuln-table" },
  { path: "/assistant", name: "ai-assistant", ready: "explanation" },
  { path: "/remediation", name: "remediation", ready: "panel-comparison" },
  { path: "/reports", name: "reports", ready: "history-table" },
];

test.beforeAll(async ({ request }) => {
  await resetDemoApi(request);
  const recs = await (await request.get(`${API}/recommendations?twin=northwind&scenario=sensitive_data_exposure`)).json();
  await request.post(`${API}/simulations`, { data: { twin_id: "northwind", scenario: "sensitive_data_exposure" } });
  await request.post(`${API}/remediations/apply`, {
    data: { twin_id: "northwind", scenario: "sensitive_data_exposure", actions: [recs.recommendations[0].action] },
  });
});

for (const width of [1024, 1280, 1440]) {
  for (const lang of ["en", "tr", "az"] as const) {
    for (const p of PAGES) {
      test(`${width}px ${lang} ${p.name}`, async ({ page }) => {
        await page.setViewportSize({ width, height: width === 1024 ? 768 : width === 1280 ? 800 : 900 });
        await page.addInitScript((l) => localStorage.setItem("cybertwin.lang", l), lang);
        await page.goto(p.path);
        await expect(page.getByTestId(p.ready)).toBeVisible();
        await page.waitForLoadState("networkidle");
        await page.waitForTimeout(900);
        const overflow = await page.evaluate(() => {
          const doc = document.documentElement;
          const pageScroll = doc.scrollWidth - doc.clientWidth;
          const main = document.getElementById("main");
          const mainScroll = main ? main.scrollWidth - main.clientWidth : 0;
          // panels whose own content overflows horizontally (tables are allowed to scroll inside .overflow-x-auto)
          const spilled = [...document.querySelectorAll<HTMLElement>("section.panel")]
            .filter((el) => el.scrollWidth - el.clientWidth > 2)
            .map((el) => el.getAttribute("aria-label") ?? el.dataset.testid ?? "panel");
          return { pageScroll, mainScroll, spilled };
        });
        if (lang === "en") await page.screenshot({ path: `${OUT}/${width}-${p.name}.png` });
        expect(overflow, JSON.stringify(overflow)).toEqual({ pageScroll: 0, mainScroll: 0, spilled: [] });
      });
    }
  }
}

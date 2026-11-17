import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { API, resetDemoApi } from "./env";

// axe-core on all 8 pages in EN, TR and AZ (WCAG 2.1 A/AA rules). Serious and critical violations fail
// the test; every violation (incl. moderate/minor) is written to e2e/a11y-report.json for review.

const PAGES = [
  { path: "/", name: "overview", ready: "panel-residual" },
  { path: "/map", name: "network-map", ready: "network-map" },
  { path: "/assets", name: "assets", ready: "asset-table" },
  { path: "/simulate", name: "attack-simulation", ready: "panel-paths" },
  { path: "/vulnerabilities", name: "vulnerabilities", ready: "vuln-table" },
  { path: "/assistant", name: "ai-assistant", ready: "explanation" },
  { path: "/remediation", name: "remediation", ready: "panel-recs" },
  { path: "/reports", name: "reports", ready: "history-table" },
];

const REPORT = resolve(import.meta.dirname, "../a11y-report.json");
function record(key: string, value: unknown[]) {
  // merge per test: a failing test restarts the worker, so in-memory state would be lost
  const cur = existsSync(REPORT) ? (JSON.parse(readFileSync(REPORT, "utf8")) as Record<string, unknown[]>) : {};
  cur[key] = value;
  writeFileSync(REPORT, JSON.stringify(cur, null, 2));
}

async function settle(page: Page, ready: string) {
  await expect(page.getByTestId(ready)).toBeVisible();
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1200); // entrance animations finish (opacity) before contrast is measured
}

test.beforeAll(async ({ request }) => {
  await resetDemoApi(request);
  await request.post(`${API}/simulations`, { data: { twin_id: "northwind", scenario: "sensitive_data_exposure" } });
});

for (const lang of ["en", "tr", "az"] as const) {
  for (const p of PAGES) {
    test(`axe ${lang} ${p.name}`, async ({ page }) => {
      await page.addInitScript((l) => localStorage.setItem("cybertwin.lang", l), lang);
      await page.goto(p.path);
      await settle(page, p.ready);
      const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
      record(
        `${lang}:${p.name}`,
        results.violations.map((v) => ({
          id: v.id,
          impact: v.impact,
          help: v.help,
          nodes: v.nodes.length,
          targets: v.nodes.slice(0, 6).map((n) => `${n.target.join(" ")} :: ${n.failureSummary?.split("\n")[1] ?? ""}`),
        })),
      );
      // axe cannot compute contrast over gradients / backdrop-filter: those land in "incomplete", not violations
      record(
        `${lang}:${p.name}:incomplete`,
        results.incomplete.map((v) => ({
          id: v.id,
          impact: v.impact,
          nodes: v.nodes.length,
          targets: v.id === "color-contrast" ? [] : v.nodes.slice(0, 4).map((n) => n.target.join(" ")),
        })),
      );
      const blocking = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
      const summary = blocking
        .map((v) => `${v.impact} ${v.id} (${v.nodes.length}): ${v.help}\n    ${v.nodes.slice(0, 4).map((n) => n.target.join(" ")).join("\n    ")}`)
        .join("\n");
      expect(blocking, summary).toEqual([]);
    });
  }
}

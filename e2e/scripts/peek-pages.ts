// Dev helper (not a test): one screenshot per page against a running dev stack, after a reset + one run.
//   node scripts/peek-pages.ts <baseUrl> <outDir> [lang] [width] [height] [fresh]
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const [base = "http://localhost:5180", out = "peek", lang = "en", w = "1440", h = "900", fresh = ""] = process.argv.slice(2);
const dir = resolve(out);
mkdirSync(dir, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: Number(w), height: Number(h) } });
await page.addInitScript((l) => {
  localStorage.setItem("cybertwin.lang", l);
  localStorage.setItem("cybertwin.tour", "skipped");
}, lang);
const errors: string[] = [];
page.on("pageerror", (e) => errors.push(String(e)));
await page.request.post(`${base}/api/v1/demo/reset`);
if (!fresh) await page.request.post(`${base}/api/v1/simulations`, { data: { twin_id: "northwind", scenario: "sensitive_data_exposure" } });
for (const [route, name] of [["/", "overview"], ["/map", "map"], ["/assets", "assets"], ["/simulate", "simulate"], ["/vulnerabilities", "vulns"], ["/assistant", "assistant"], ["/remediation", "remediation"], ["/reports", "reports"]]) {
  await page.goto(`${base}${route}`);
  await page.waitForLoadState("networkidle").catch(() => undefined);
  await new Promise((r) => setTimeout(r, 1200));
  if (name === "map") {
    await page.locator("[data-testid^=node-]").nth(3).click().catch(() => undefined);
    await new Promise((r) => setTimeout(r, 800));
  }
  await page.screenshot({ path: resolve(dir, `${lang}-${w}-${name}.png`) });
}
console.log(errors.length ? `ERRORS:\n${errors.join("\n")}` : "no page errors");
await browser.close();

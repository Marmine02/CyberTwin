// Dev helper (not a test): screenshots of the simulation flow against a running dev stack.
//   node scripts/peek.ts <baseUrl> <outDir> [lang] [width] [height]
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const [base = "http://localhost:5180", out = "peek", lang = "en", w = "1440", h = "900"] = process.argv.slice(2);
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
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
await page.request.post(`${base}/api/v1/demo/reset`);
const shot = (n: string) => page.screenshot({ path: resolve(dir, `${n}.png`) });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

await page.goto(`${base}/simulate`);
await sleep(800);
await shot("01-empty");
await page.getByTestId("scenario-sensitive_data_exposure").click();
await page.getByTestId("run-simulation").click();
await sleep(400);
await shot("02-run-0s");
await sleep(2600);
await shot("03-run-3s");
await sleep(3600);
await shot("04-run-7s");
await page.getByTestId("replay-toggle").click();
await page.getByTestId("event-3").click();
await sleep(900);
await shot("05-event-click");
// apply top 3 via the UI
await page.goto(`${base}/remediation?scenario=sensitive_data_exposure`);
await page.getByTestId("select-top3").click();
await page.getByTestId("apply-selected").click();
await page.getByTestId("confirm-button").click();
await page.getByTestId("after-score").waitFor();
await sleep(1500);
await shot("06-remediation-after");
await page.goto(`${base}/simulate`);
await page.getByTestId("scenario-outdated_service_exploitation").click();
await page.getByTestId("run-simulation").click();
await sleep(1500);
await shot("07-r2-nopath");
await page.goto(`${base}/simulate`);
await sleep(1200);
await shot("08-default-meaningful");
console.log(errors.length ? `ERRORS:\n${errors.join("\n")}` : "no page errors");
await browser.close();

// Dev helper: renders the Azerbaijani letters in every font role the UI uses, at a large size, on the real page
// (so the bundled @font-face rules apply), and saves one screenshot. Also reports which font each sample used.
//   node scripts/glyphs.ts <baseUrl> <out.png>
import { chromium } from "@playwright/test";

const [base = "http://localhost:5180", out = "glyphs.png"] = process.argv.slice(2);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1100, height: 560 } });
await page.addInitScript(() => localStorage.setItem("cybertwin.tour", "skipped"));
await page.goto(base);
await page.waitForLoadState("networkidle");
const sample = "ə Ə ğ Ğ ı İ ö Ö ş Ş ç Ç ü Ü · Hücumun təkrarı 25 · Ələ keçirilib";
await page.evaluate((text) => {
  document.body.innerHTML = "";
  document.body.style.padding = "24px";
  const roles: [string, string, string][] = [
    ["display 700 (.display-num / .page-title)", "var(--font-display)", "700"],
    ["display 600", "var(--font-display)", "600"],
    ["body 400 (IBM Plex Sans)", "var(--font-sans)", "400"],
    ["body 600", "var(--font-sans)", "600"],
    ["mono 400 (JetBrains Mono)", "var(--font-mono)", "400"],
  ];
  for (const [label, family, weight] of roles) {
    const l = document.createElement("div");
    l.textContent = label;
    l.style.cssText = "font: 12px var(--font-sans); color: #a3afbf; margin-top: 14px";
    const d = document.createElement("div");
    d.textContent = text;
    d.style.cssText = `font-family: ${family}; font-weight: ${weight}; font-size: 40px; color: #e6ebf2`;
    document.body.append(l, d);
  }
}, sample);
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(600);
await page.screenshot({ path: out });
// which faces were actually loaded for these samples
const cdp = await page.context().newCDPSession(page);
await cdp.send("DOM.enable");
await cdp.send("CSS.enable");
const { root } = await cdp.send("DOM.getDocument");
const { nodeIds } = await cdp.send("DOM.querySelectorAll", { nodeId: root.nodeId, selector: "body > div:nth-child(even)" });
for (const id of nodeIds) {
  const { fonts } = await cdp.send("CSS.getPlatformFontsForNode", { nodeId: id });
  console.log(fonts.map((f) => `${f.familyName}${f.isCustomFont ? "" : " (SYSTEM)"}: ${f.glyphCount}`).join(" | "));
}
await browser.close();

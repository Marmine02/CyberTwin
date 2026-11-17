import { expect, test, type Page } from "@playwright/test";
import az from "../../frontend/src/i18n/az";
import en from "../../frontend/src/i18n/en";
import tr from "../../frontend/src/i18n/tr";
import { API, resetDemoApi } from "./env";

// No foreign UI or engine string may remain in the Turkish or Azerbaijani UI.
// The check is catalog-driven: every source-language string (frontend resources + engine message catalog) whose
// target translation differs is split around its {{placeholders}} into fixed fragments; no multi-word source
// fragment may appear in any page's visible text in the target language. For AZ the sources are English AND
// Turkish (Azerbaijani must not be Turkish with letters swapped). User-entered data (asset names, descriptions) is
// data, not UI text, and is intentionally out of scope (documented in KNOWN_GAPS.md).

type Lang = "en" | "tr" | "az";
type Tree = { [k: string]: string | Tree };
const UI: Record<Lang, Tree> = { en: en as unknown as Tree, tr: tr as unknown as Tree, az: az as unknown as Tree };

function flatten(t: Tree, prefix = "", out: Record<string, string> = {}): Record<string, string> {
  for (const [k, v] of Object.entries(t)) {
    if (typeof v === "string") out[prefix + k] = v;
    else flatten(v, `${prefix}${k}.`, out);
  }
  return out;
}

function fragments(text: string, targetTexts: string[]): string[] {
  return text
    .split(/\{\{[^}]+\}\}/)
    .map((f) => f.replace(/^[\s.,:;()'"“”·—–→↔\-/]+|[\s.,:;()'"“”·—–→↔\-/]+$/g, ""))
    .filter((f) => f.split(/\s+/).length >= 2 && f.length >= 10 && /\p{Ll}/u.test(f))
    .filter((f) => !targetTexts.some((t) => t.includes(f))); // identical in the target (e.g. product names)
}

/** Fixed fragments of `source` strings that must not appear in a `target`-language UI. */
async function foreignFragments(page: Page, source: Lang, target: Lang): Promise<string[]> {
  const src = flatten(UI[source]);
  const dst = flatten(UI[target]);
  const engine = (await (await page.request.get(`${API}/i18n/engine`)).json()) as Record<string, Record<string, string>>;
  const dstAll = [...Object.values(dst), ...Object.values(engine[target]!)];
  const out = new Set<string>();
  for (const [k, v] of Object.entries(src)) if (dst[k] !== v) fragments(v, dstAll).forEach((f) => out.add(f));
  for (const [k, v] of Object.entries(engine[source]!)) if (engine[target]![k] !== v) fragments(v, dstAll).forEach((f) => out.add(f));
  return [...out].sort();
}

test.beforeAll(async ({ request }) => {
  await resetDemoApi(request);
});

const CASES: { target: Lang; sources: Lang[]; summary: string; control: Record<string, string> }[] = [
  { target: "tr", sources: ["en"], summary: "Yönetici özeti", control: { en: "Dump cached credentials of" } },
  {
    target: "az",
    sources: ["en", "tr"],
    summary: "Rəhbərlik üçün xülasə",
    control: { en: "Dump cached credentials of", tr: "kimlik bilgileri dökülür" },
  },
];

for (const c of CASES) {
  test(`${c.target.toUpperCase()} UI shows no ${c.sources.map((s) => s.toUpperCase()).join(" or ")} UI or engine strings`, async ({ page }) => {
    test.setTimeout(240_000);
    await resetDemoApi(page.request);
    await page.addInitScript((l) => localStorage.setItem("cybertwin.lang", l), c.target);
    // a full flow so every surface has content: simulation, applied fixes (change log, residual), events
    const run = await (await page.request.post(`${API}/simulations`, { data: { twin_id: "northwind", scenario: "sensitive_data_exposure" } })).json();
    const recs = await (await page.request.get(`${API}/recommendations?twin=northwind&scenario=sensitive_data_exposure`)).json();
    const applied = await (await page.request.post(`${API}/remediations/apply`, {
      data: { twin_id: "northwind", scenario: "sensitive_data_exposure", actions: recs.recommendations.slice(0, 3).map((r: { action: unknown }) => r.action) },
    })).json();
    await page.request.post(`${API}/simulations`, { data: { twin_id: "northwind", scenario: "lateral_movement" } });

    const banned: Record<string, string[]> = {};
    for (const s of c.sources) {
      banned[s] = await foreignFragments(page, s, c.target);
      expect(banned[s]!.length, `${s} fragments`).toBeGreaterThan(150); // the check really has teeth
      expect(banned[s]).toContain(c.control[s]);
    }
    expect(banned.en).toContain("Run simulation");

    const pages: { name: string; url: string; ready: string; extra?: (p: Page) => Promise<void> }[] = [
      { name: "overview", url: "/", ready: "panel-residual" },
      { name: "map", url: "/map", ready: "network-map" },
      { name: "assets", url: "/assets", ready: "asset-table" },
      { name: "simulate", url: `/simulate?run=${run.id}`, ready: "panel-paths",
        extra: async (p) => {
          await p.getByTestId("path-P1").locator("summary").click();
          await p.getByTestId("event-2").click(); // narration card in full
        } },
      { name: "vulnerabilities", url: "/vulnerabilities", ready: "vuln-table" },
      { name: "assistant", url: `/assistant?run=${applied.comparison.after_simulation_id}&remediation=${applied.remediation_id}`, ready: "panel-chat",
        extra: async (p) => { await expect(p.getByTestId("explanation")).toContainText(c.summary); } },
      { name: "remediation", url: "/remediation?scenario=sensitive_data_exposure", ready: "panel-comparison",
        extra: async (p) => { await p.getByTestId("panel-comparison").locator("details summary").click(); } },
      { name: "reports", url: "/reports", ready: "history-table" },
    ];

    const offenders: string[] = [];
    for (const p of pages) {
      await page.goto(p.url);
      await expect(page.getByTestId(p.ready)).toBeVisible();
      await page.waitForLoadState("networkidle");
      if (p.extra) await p.extra(page);
      // the bell's panel lists events (translated messages)
      await page.getByTestId("bell").click();
      const text = await page.locator("body").innerText();
      await page.keyboard.press("Escape");
      for (const s of c.sources) for (const f of banned[s]!) if (text.includes(f)) offenders.push(`${p.name} [${s}]: "${f}"`);
    }
    expect(offenders, `foreign fragments in the ${c.target} UI:\n${offenders.join("\n")}`).toEqual([]);

    // negative control: the same scan on each source-language UI must find many banned fragments
    for (const s of c.sources) {
      const ctl = await page.context().newPage();
      await ctl.addInitScript((l) => localStorage.setItem("cybertwin.lang", l), s);
      await ctl.goto(`/simulate?run=${run.id}`);
      await expect(ctl.getByTestId("panel-paths")).toBeVisible();
      await ctl.getByTestId("path-P1").locator("summary").click();
      await expect(ctl.getByTestId("path-P1")).toContainText("P1.S5", { timeout: 15_000 });
      const ctlText = await ctl.locator("body").innerText();
      const hits = banned[s]!.filter((f) => ctlText.includes(f));
      expect(hits.length, `${s} control found: ${hits.slice(0, 5).join(" | ")}`).toBeGreaterThan(10);
      await ctl.close();
    }
  });
}

const ERRORS: { lang: Lang; tab: RegExp; newRule: string; message: string }[] = [
  { lang: "tr", tab: /Güvenlik duvarı kuralları/, newRule: "Yeni kural", message: "'web-01' varlığında 3389 portu açık değil; kural oluşturulamaz" },
  { lang: "az", tab: /Brandmauer qaydaları/, newRule: "Yeni qayda", message: "'web-01' aktivində 3389 portu açıq deyil; qayda yaratmaq mümkün deyil" },
];

for (const e of ERRORS) {
  test(`server-side errors are shown in ${e.lang.toUpperCase()} (API {code, params}), not in English`, async ({ page }) => {
    await page.addInitScript((l) => localStorage.setItem("cybertwin.lang", l), e.lang);
    await page.goto("/assets");
    await page.getByRole("tab", { name: e.tab }).click();
    await page.getByRole("button", { name: e.newRule }).click();
    await page.getByTestId("r-id").fill(`fe-77${e.lang === "tr" ? 8 : 9}`);
    await page.getByTestId("r-action").selectOption("allow");
    await page.getByTestId("r-dstmode").selectOption("asset");
    await page.getByTestId("r-dstasset").selectOption("web-01");
    await page.getByTestId("r-port").fill("3389");
    await page.getByTestId("save-rule").click();
    // same request as demo-flow's "shown verbatim" test, which asserts the English text in EN
    await expect(page.getByText(e.message)).toBeVisible();
    await expect(page.getByText("has no port 3389 open")).toHaveCount(0);
  });
}

test("Azerbaijani dates and numbers follow az-Latn-AZ (Intl, or CLDR az rules where Chromium lacks the data)", async ({ page }) => {
  await resetDemoApi(page.request);
  const run = await (await page.request.post(`${API}/simulations`, { data: { twin_id: "northwind", scenario: "sensitive_data_exposure" } })).json();
  await page.addInitScript(() => localStorage.setItem("cybertwin.lang", "az"));
  await page.goto(`/simulate?run=${run.id}`);
  await expect(page.getByTestId("panel-paths")).toBeVisible();
  // Chromium has no az locale data, so the app falls back to CLDR az rules ("16 noy 2026, 14:42"); a browser
  // with az data (e.g. Edge) gives the same pattern through Intl
  await expect(page.locator("body")).toContainText(/İcra vaxtı: \d{1,2} (yan|fev|mar|apr|may|iyn|iyl|avq|sen|okt|noy|dek)\.? \d{4},? \d\d:\d\d/);
  await expect(page.getByTestId("path-P1")).toContainText("70,9%"); // decimal comma
  expect(await page.evaluate(() => document.documentElement.lang)).toBe("az");
});

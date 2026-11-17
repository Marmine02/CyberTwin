import { expect, test, type Page } from "@playwright/test";
import { API, replayToEnd, resetDemoApi } from "./env";

// Real path (uvicorn + SQLite + production build): the "functions feel real" items of the UX round.

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const pos = async (page: Page) => Number(((await page.getByTestId("replay-pos").textContent()) ?? "0/0").split("/")[0]);

async function applyTop3(page: Page) {
  const recs = await (await page.request.get(`${API}/recommendations?twin=northwind&scenario=sensitive_data_exposure`)).json();
  const actions = recs.recommendations.filter((r: { expected_delta_score: number }) => r.expected_delta_score > 0).slice(0, 3).map((r: { action: unknown }) => r.action);
  const res = await page.request.post(`${API}/remediations/apply`, { data: { twin_id: "northwind", scenario: "sensitive_data_exposure", actions } });
  expect(res.ok()).toBeTruthy();
}

async function run(page: Page, scenario: string) {
  await page.getByTestId(`scenario-${scenario}`).click();
  await page.getByTestId("run-simulation").click();
  await expect(page).toHaveURL(/\/simulate\?run=/);
}

test.describe.configure({ mode: "serial" });

test.beforeEach(async ({ page, request }) => {
  await resetDemoApi(request);
  await page.addInitScript(() => localStorage.setItem("cybertwin.lang", "en"));
});

test("a run with no path says why and offers r1, compare and reset", async ({ page }) => {
  await applyTop3(page);
  await page.goto("/simulate");
  await run(page, "outdated_service_exploitation");
  const state = page.getByTestId("no-path-state");
  await expect(state).toContainText("This revision blocks every path to the goal. The fixes were applied in r2.");
  await expect(page.getByTestId("revision-context")).toHaveAttribute("data-revision", "2");
  await expect(page.getByTestId("revision-context")).toContainText("r2 · after fixes");

  // compare: runs the same scenario on r1 and shows both side by side
  await page.getByTestId("compare-before").click();
  const strip = page.getByTestId("compare-strip");
  await expect(strip.getByTestId("compare-1")).toBeVisible();
  await expect(strip.getByTestId("compare-2")).toContainText("100");
  await expect(strip.getByTestId("compare-1")).not.toContainText("100");
  await strip.getByTestId("compare-1").click();
  await expect(page.getByTestId("sim-revision")).toHaveAttribute("data-revision", "1");
  await expect(page.getByTestId("no-path-state")).toHaveCount(0);

  // back to r2: "Run on r1 (before fixes)" opens a fresh r1 run that has paths
  await strip.getByTestId("compare-2").click();
  await page.getByTestId("run-before").click();
  await expect(page.getByTestId("sim-revision")).toHaveAttribute("data-revision", "1");
  await expect(page.getByTestId("revision-context")).toContainText("latest is r2 · after fixes");
  await replayToEnd(page);
  expect(Number(await page.getByTestId("sim-score").textContent())).toBeLessThan(100);

  // opening the page without a run id prefers the newest run that found paths over an empty one
  await page.goto("/simulate");
  await run(page, "outdated_service_exploitation");
  await expect(page.getByTestId("no-path-state")).toBeVisible();
  await page.goto("/simulate");
  await expect(page.getByTestId("defaulted-note")).toContainText("The newest run, on r2, found none.");
  await expect(page.getByTestId("sim-revision")).toHaveAttribute("data-revision", "1");

  // reset demo from the no-path state asks first
  await page.getByRole("button", { name: "Show the newest run" }).click();
  await page.getByTestId("no-path-reset").click();
  await page.getByTestId("confirm-button").click();
  await expect(page.getByTestId("toast").filter({ hasText: "Demo restored" })).toBeVisible();
  const twin = await (await page.request.get(`${API}/twins/northwind`)).json();
  expect(twin.twin.head_revision).toBe(1);
});

test("run → the real replay plays, the camera follows and a card narrates each step", async ({ page }) => {
  await page.goto("/simulate");
  await run(page, "sensitive_data_exposure");
  const toast = page.getByTestId("toast").filter({ hasText: "Sensitive Data Exposure on r1 finished" });
  await expect(toast).toContainText("Score 25: 10 attack paths, 6 of 8 assets compromised.");
  const narration = page.getByTestId("narration");
  await expect(narration).toHaveAttribute("data-step", /^\d+$/);
  const viewport = page.getByTestId("sim-map").locator(".react-flow__viewport");
  const p0 = await pos(page);
  const t0 = await viewport.getAttribute("style");
  await sleep(3700);
  const p1 = await pos(page);
  // 1.2 s per step at 1x: about 3 steps in 3.7 s (tolerance for timer jitter)
  expect(p1 - p0).toBeGreaterThanOrEqual(2);
  expect(p1 - p0).toBeLessThanOrEqual(4);
  expect(await viewport.getAttribute("style")).not.toBe(t0); // the camera moved
  await expect(page.getByTestId("sim-map").locator('[data-active="true"]').first()).toBeVisible();
  // narration: plain sentence with asset names, technique, odds and ATT&CK id
  await page.getByTestId("replay-toggle").click(); // pause
  await page.getByTestId("event-2").click();
  await expect(narration).toHaveAttribute("data-step", "2");
  await expect(page.getByTestId("narration-headline")).toHaveText("Public Web Server is exploited");
  await expect(page.getByTestId("narration-story")).toContainText("Exploiting it gives the attacker admin access to Public Web Server");
  await expect(narration).toContainText("Remote exploit");
  await expect(narration).toContainText("T1190");
  await expect(page.getByTestId("sim-map").getByTestId("node-web-01")).toHaveAttribute("data-active", "true");
});

test("event log: readable sentences, no raw tuples, no clipping; a click jumps the replay", async ({ page }) => {
  await page.goto("/simulate");
  await run(page, "sensitive_data_exposure");
  await replayToEnd(page);
  const texts = page.getByTestId("event-log").getByTestId("event-text");
  await expect(texts).toHaveCount(32);
  const all = await texts.allTextContents();
  for (const x of all) {
    expect(x).not.toMatch(/#|tcp\/|…|ATTACKER@|CRED:|DATA:/);
    expect(x).toMatch(/[.)]$/); // whole sentences
  }
  expect(all[0]).toBe("The attacker can connect from the internet to Public Web Server on port 22 (ssh OpenSSH_7.2p2).");
  const overflow = await texts.evaluateAll((els) => els.filter((e) => e.scrollWidth > e.clientWidth + 1).length);
  expect(overflow).toBe(0);
  // the current event shows the full narration (both sentences), the others their first sentence + full text on hover
  await page.getByTestId("event-0").click();
  await expect(page.getByTestId("event-0")).toContainText("The rules on Edge Firewall allow this traffic.");
  await expect(page.getByTestId("event-1")).toHaveAttribute("title", /The rules on Edge Firewall allow this traffic\.$/);
  await page.getByTestId("event-9").click();
  await expect(page.getByTestId("replay-pos")).toHaveText("10/32");
  await expect(page.getByTestId("narration")).toHaveAttribute("data-step", "9");
  await expect(page.getByTestId("replay-toggle")).toHaveText(/Play/);
});

test("map: no attribution, fits its frame on load and after a resize", async ({ page }) => {
  await page.goto("/simulate");
  await run(page, "sensitive_data_exposure");
  await replayToEnd(page);
  const map = page.getByTestId("sim-map");
  await expect(map.locator(".react-flow__attribution")).toHaveCount(0);
  const clipped = () =>
    page.evaluate(() => {
      const f = document.querySelector("[data-testid=sim-map-frame]")!.getBoundingClientRect();
      return [...document.querySelectorAll("[data-testid=sim-map] [data-testid^=node-]")]
        .map((n) => ({ id: n.getAttribute("data-testid"), r: n.getBoundingClientRect() }))
        .filter(({ r }) => r.left < f.left - 1 || r.right > f.right + 1 || r.top < f.top - 1 || r.bottom > f.bottom + 1)
        .map((x) => x.id);
    });
  await sleep(800);
  expect(await clipped()).toEqual([]);
  for (const [w, h] of [[1024, 768], [1280, 800], [1440, 900]] as const) {
    await page.setViewportSize({ width: w, height: h });
    await sleep(900);
    expect(await clipped(), `${w}x${h}`).toEqual([]);
  }
  // asset-type filter chips re-fit the map too
  await page.getByTestId("filter-employee_ws").click();
  await expect(page.getByTestId("filter-employee_ws")).toHaveAttribute("aria-pressed", "false");
  await sleep(900);
  expect(await clipped()).toEqual([]);
  await page.getByTestId("filter-employee_ws").click();
});

test("every action gives feedback: pending button, change toast with a link, top fix preselected", async ({ page }) => {
  await page.goto("/simulate");
  // hold the real request briefly so the pending state is observable
  await page.route("**/api/v1/simulations", async (route) => {
    await sleep(700);
    await route.continue();
  });
  await page.getByTestId("scenario-sensitive_data_exposure").click();
  await page.getByTestId("run-simulation").click();
  await expect(page.getByTestId("run-simulation")).toHaveAttribute("aria-busy", "true");
  await expect(page.getByTestId("run-simulation")).toHaveText("Running…");
  await expect(page.getByTestId("run-simulation")).not.toHaveAttribute("aria-busy", "true");
  await page.unroute("**/api/v1/simulations");
  // second run of the same scenario: the toast states the change
  await page.getByTestId("run-simulation").click();
  const toast = page.getByTestId("toast").filter({ hasText: "since the last run" });
  await expect(toast).toContainText("Score 25 → 25 since the last run (r1); attack paths 10 → 10.");
  await toast.getByRole("button", { name: "Open the result" }).click();
  await expect(page).toHaveURL(/run=/);
  // the biggest single fix is named under the score and preselected in Remediation
  await expect(page.getByTestId("top-fix")).toContainText("+75.5");
  await page.getByTestId("top-fix-open").click();
  await expect(page).toHaveURL(/\/remediation\?scenario=sensitive_data_exposure&fix=vuln-ssh-exposed/);
  await expect(page.getByTestId("apply-selected")).toHaveText(/Apply 1 fix/);
  // remediation: readable path changes and asset names after Apply
  await page.getByTestId("apply-selected").click();
  await page.getByTestId("confirm-button").click();
  await expect(page.getByTestId("toast").filter({ hasText: "Fixes applied as r2" })).toContainText("Score 25 → 100");
  await expect(page.getByTestId("blocked-paths")).toContainText("Internet → Public Web Server (admin) → Identity Server (user)");
  await expect(page.getByTestId("panel-comparison")).toContainText("Customer Database");
  await expect(page.getByTestId("recs-residual-only")).toContainText("No attack path is left in this scenario on r2.");
});

test.describe("guided demo", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("first launch: five anchored steps on the real UI, remembered, restartable and skippable", async ({ page }) => {
    await page.goto("/");
    const tour = page.getByTestId("tour");
    await expect(tour).toHaveAttribute("data-step", "0");
    await expect(tour).toContainText("This is the digital twin");
    await page.getByTestId("tour-next").click();

    await expect(page).toHaveURL(/\/simulate$/);
    await expect(tour).toHaveAttribute("data-step", "1");
    await expect(tour).toContainText("Run an attack scenario");
    await page.getByTestId("run-simulation").click();

    await expect(tour).toHaveAttribute("data-step", "2"); // advanced by the finished run
    await expect(tour).toContainText("Watch the replay");
    await page.getByRole("group", { name: "Playback speed" }).getByRole("button", { name: "4x" }).click();
    await expect(tour).toHaveAttribute("data-step", "3", { timeout: 30_000 }); // advanced when the replay ended

    await expect(page).toHaveURL(/\/remediation\?scenario=sensitive_data_exposure/);
    await expect(tour).toContainText("Apply the recommended fixes");
    await page.getByTestId("select-top3").click();
    await page.getByTestId("apply-selected").click();
    await page.getByTestId("confirm-button").click();

    await expect(tour).toHaveAttribute("data-step", "4"); // advanced by Apply
    await expect(tour).toContainText("Compare before and after");
    await expect(page.getByTestId("panel-comparison")).toBeVisible();
    await page.getByTestId("tour-finish").click();
    await expect(tour).toHaveCount(0);

    await page.goto("/");
    await sleep(600);
    await expect(tour).toHaveCount(0); // done is remembered

    await page.getByTestId("help").click();
    await page.getByTestId("help-tour").click();
    await expect(tour).toHaveAttribute("data-step", "0");
    await page.keyboard.press("Escape");
    await expect(tour).toHaveCount(0);
    expect(await page.evaluate(() => localStorage.getItem("cybertwin.tour"))).toBe("skipped");
    await page.reload();
    await sleep(600);
    await expect(tour).toHaveCount(0);
  });
});

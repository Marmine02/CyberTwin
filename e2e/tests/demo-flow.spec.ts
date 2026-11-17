import { expect, test, type Page } from "@playwright/test";
import { replayToEnd, resetDemoApi } from "./env";

// Real path: Playwright -> Vite dev server -> /api proxy -> uvicorn -> SQLite. Nothing is mocked.

async function resetDemo(page: Page) {
  await page.goto("/");
  await page.getByTestId("reset-demo").click();
  await page.getByTestId("confirm-button").click();
  await expect(page.getByTestId("toast").filter({ hasText: "Demo restored" })).toBeVisible();
}

async function scoreOf(page: Page): Promise<number> {
  const txt = (await page.getByTestId("sim-score").textContent()) ?? "";
  return Number(txt.trim());
}

test.describe.configure({ mode: "serial" });

test.beforeAll(async ({ request }) => {
  await resetDemoApi(request);
});

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("cybertwin.lang", "en"));
});

test("demo flow: simulate → explain → remediate → revert", async ({ page }) => {
  await resetDemo(page);

  // ---- run Sensitive Data Exposure from the Attack Simulation page
  await page.goto("/simulate");
  await page.getByTestId("scenario-sensitive_data_exposure").click();
  await page.getByTestId("run-simulation").click();
  const toast = page.getByTestId("toast").filter({ hasText: "Sensitive Data Exposure on r1 finished" });
  await expect(toast).toBeVisible();
  await expect(page).toHaveURL(/\/simulate\?run=/); // a run started here opens itself
  await toast.getByRole("button", { name: "Open the result" }).click();
  await expect(page).toHaveURL(/\/simulate\?run=/);
  await replayToEnd(page);

  const before = await scoreOf(page);
  expect(before).toBeGreaterThanOrEqual(20);
  expect(before).toBeLessThanOrEqual(35);

  // primary path highlighted on the map: Internet → fw-edge → web-01 → idp-01 → customer-db
  const map = page.getByTestId("sim-map");
  await expect(map.locator('[data-attack="true"]')).toHaveCount(4);
  for (const id of ["web-01", "idp-01", "customer-db"]) {
    await expect(map.getByTestId(`node-${id}`)).toHaveAttribute("data-onpath", "true");
  }
  await expect(map.getByTestId("node-web-01")).toHaveAttribute("data-state", "compromised");
  await expect(map.getByTestId("blast-halo")).toBeVisible();
  await expect(page.getByTestId("path-P1")).toContainText("P1.S5");

  // replay controls move the scrubber and the map
  await page.getByTestId("replay-toggle").click(); // restart from the beginning
  await page.getByTestId("replay-toggle").click(); // pause
  await expect(page.getByTestId("replay-pos")).not.toHaveText(/^32\/32$/);
  await page.getByTestId("scrubber").fill("31");
  await expect(page.getByTestId("replay-pos")).toHaveText(/^32\//);

  // ---- AI assistant in fallback mode (no provider configured for e2e)
  await page.goto("/assistant");
  await expect(page.getByTestId("ai-mode")).toHaveAttribute("data-mode", "fallback");
  const explanation = page.getByTestId("explanation");
  await expect(explanation).toContainText("Executive summary");
  await expect(explanation).toContainText("P1.S2");
  await expect(page.getByTestId("unverified-banner")).toHaveCount(0);
  await page.getByTestId("chat-input").fill("What should I fix first?");
  await page.getByTestId("chat-send").click();
  await expect(page.getByTestId("panel-chat")).toContainText("restrict_port:web-01:22:mgmt");

  // ---- apply the top 3 recommendations
  await page.goto("/remediation?scenario=sensitive_data_exposure");
  await expect(page.getByTestId("rec-list")).toBeVisible();
  await page.getByTestId("select-top3").click();
  await page.getByTestId("apply-selected").click();
  await page.getByTestId("confirm-button").click();
  const cmp = page.getByTestId("panel-comparison");
  await expect(cmp).toBeVisible();
  await expect(page.getByTestId("after-score").locator("[data-value]")).toHaveAttribute("data-value", /^(8\d|9\d|100)$/);
  const afterScore = Number(await page.getByTestId("after-score").locator("[data-value]").getAttribute("data-value"));
  expect(afterScore).toBeGreaterThanOrEqual(80);
  expect(Number(await page.getByTestId("blocked-count").textContent())).toBeGreaterThan(0);
  await expect(page.getByTestId("blocked-paths")).toContainText("Internet → Public Web Server (admin)");

  // residual exposure: still present but no longer exploitable, e.g. svc-web admin on customer-db
  const residual = page.getByTestId("remed-residual");
  for (const v of ["vuln-svcweb-dbadmin", "vuln-svcweb-weakpw", "vuln-ws-privesc", "vuln-admapp-cached"]) {
    await expect(residual.getByTestId(`residual-${v}`)).toBeVisible();
  }
  await page.goto("/");
  await expect(page.getByTestId("panel-residual").getByTestId("residual-vuln-svcweb-dbadmin")).toBeVisible();
  await page.goto("/remediation?scenario=sensitive_data_exposure");
  await expect(page.getByTestId("panel-comparison")).toBeVisible();

  // ---- revert restores the original score
  await page.getByTestId("revert").click();
  await page.getByTestId("confirm-button").click();
  const restored = page.getByTestId("toast").filter({ hasText: "Score restored to" });
  await expect(restored).toBeVisible();
  await expect(restored).toContainText(`Score restored to ${before}.`);
  await restored.getByRole("button", { name: "Open the result" }).click();
  expect(await scoreOf(page)).toBe(before);
});

test("CRUD: create an asset, connect it, delete it", async ({ page }) => {
  await resetDemo(page);
  await page.goto("/assets");
  await page.getByTestId("new-asset").click();

  // client-side validation message for a bad IP
  await page.getByTestId("f-id").fill("web-02");
  await page.getByTestId("f-name").fill("Staging Web");
  await page.getByTestId("f-ip").fill("10.0.1.300");
  await page.getByTestId("save-asset").click();
  await expect(page.getByText("Enter an IPv4 address such as 10.0.2.15.")).toBeVisible();

  await page.getByTestId("f-ip").fill("10.0.1.11");
  await page.getByTestId("f-type").selectOption("web_server");
  await page.getByTestId("f-zone").selectOption("dmz");
  await page.getByTestId("add-port").click();
  await page.getByTestId("save-asset").click();
  await expect(page.getByTestId("toast").filter({ hasText: "Staging Web created" })).toBeVisible();
  await expect(page.getByTestId("asset-row-web-02")).toBeVisible();

  // connect web-02 -> fw-edge by dragging the handle on the network map
  await page.goto("/map");
  const map = page.getByTestId("network-map");
  const node = map.getByTestId("node-web-02");
  await expect(node).toBeVisible();
  const handle = map.locator('.react-flow__node[data-id="web-02"] .react-flow__handle-bottom');
  const target = map.getByTestId("node-fw-edge");
  await node.hover();
  await handle.hover({ force: true });
  await page.mouse.down();
  const tb = await target.boundingBox();
  await page.mouse.move(tb!.x + tb!.width / 2, tb!.y + tb!.height / 2, { steps: 12 });
  await page.mouse.up();
  await expect(page.getByRole("dialog", { name: "Create connection" })).toBeVisible();
  await page.getByTestId("connect-confirm").click();
  await expect(page.getByTestId("toast").filter({ hasText: "Connected web-02 → fw-edge" })).toBeVisible();
  await expect(map.getByTestId("edge-c-web-02-fw-edge")).toHaveCount(1);

  // delete shows affected connections, then removes the asset
  await page.goto("/assets");
  await page.getByTestId("delete-web-02").click();
  await expect(page.getByTestId("delete-impact")).toContainText("c-web-02-fw-edge");
  await page.getByTestId("confirm-button").click();
  await expect(page.getByTestId("toast").filter({ hasText: "Staging Web deleted" })).toBeVisible();
  await expect(page.getByTestId("asset-row-web-02")).toHaveCount(0);
});

test("server-side validation error is shown verbatim", async ({ page }) => {
  await resetDemo(page);
  await page.goto("/assets");
  await page.getByRole("tab", { name: /Firewall rules/ }).click();
  await page.getByRole("button", { name: "New rule" }).click();
  await page.getByTestId("r-id").fill("fe-777");
  await page.getByTestId("r-action").selectOption("allow");
  await page.getByTestId("r-dstmode").selectOption("asset");
  await page.getByTestId("r-dstasset").selectOption("web-01");
  await page.getByTestId("r-port").fill("3389");
  await page.getByTestId("save-rule").click();
  await expect(page.getByText("Asset 'web-01' has no port 3389 open; cannot create rule")).toBeVisible();
});

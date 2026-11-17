import { expect, test, type Page } from "@playwright/test";
import { API, replayToEnd, resetDemoApi } from "./env";

// Item 3: connection edit/delete, vulnerability create/edit form, revision picker on Attack Simulation.
// Real uvicorn + real Vite + real SQLite; nothing mocked.


async function resetDemo(page: Page) {
  await page.addInitScript(() => localStorage.setItem("cybertwin.lang", "en"));
  await page.goto("/");
  await page.getByTestId("reset-demo").click();
  await page.getByTestId("confirm-button").click();
  await expect(page.getByTestId("toast").filter({ hasText: "Demo restored" })).toBeVisible();
}

test.describe.configure({ mode: "serial" });

test.beforeAll(async ({ request }) => {
  await resetDemoApi(request);
});

test("edit and delete a single connection (table and map)", async ({ page, request }) => {
  await resetDemo(page);
  await page.goto("/assets");
  await page.getByRole("tab", { name: /Connections/ }).click();
  await expect(page.getByTestId("connection-table")).toBeVisible();

  // edit: restrict c-fwedge-web to 443 and change the description
  await page.getByTestId("conn-edit-c-fwedge-web").click();
  await page.getByTestId("conn-port-443").check();
  await page.getByTestId("conn-desc").fill("DMZ leg (HTTPS only)");
  await page.getByTestId("conn-save").click();
  await expect(page.getByTestId("toast").filter({ hasText: "Connection c-fwedge-web saved" })).toBeVisible();
  const row = page.getByTestId("conn-row-c-fwedge-web");
  await expect(row).toContainText("443");
  await expect(row).toContainText("DMZ leg (HTTPS only)");
  const conns = await (await request.get(`${API}/twins/northwind/connections`)).json();
  expect(conns.find((c: { id: string }) => c.id === "c-fwedge-web").ports).toEqual([443]);

  // the engine honours it: SSH (22) is no longer reachable over that link, so the demo path is gone
  const run = await (await request.post(`${API}/simulations`, { data: { twin_id: "northwind", scenario: "sensitive_data_exposure" } })).json();
  expect(run.result.primary_path?.steps[0].to ?? "").not.toBe("web-01#network:22");

  // delete from the map: click the link, confirm
  await page.goto("/map");
  const edge = page.getByTestId("network-map").getByTestId("edge-c-ws-fwint");
  await expect(edge).toHaveCount(1);
  await edge.locator("path.react-flow__edge-path").dispatchEvent("click");
  await expect(page.getByRole("dialog", { name: "Edit connection c-ws-fwint" })).toBeVisible();
  await page.getByTestId("conn-delete").click();
  await expect(page.getByRole("dialog", { name: "Delete connection c-ws-fwint?" })).toBeVisible();
  await page.getByTestId("confirm-button").click();
  await expect(page.getByTestId("toast").filter({ hasText: "Connection c-ws-fwint deleted" })).toBeVisible();
  await expect(page.getByTestId("network-map").getByTestId("edge-c-ws-fwint")).toHaveCount(0);

  // cancel path: the confirmation dialog can be dismissed without deleting
  await page.goto("/assets");
  await page.getByRole("tab", { name: /Connections/ }).click();
  await page.getByTestId("conn-edit-c-app-idp").click();
  await page.getByTestId("conn-delete").click();
  await page.getByRole("button", { name: "Cancel" }).last().click();
  await expect(page.getByTestId("conn-row-c-app-idp")).toBeVisible();
});

test("create and edit a vulnerability with the full form", async ({ page, request }) => {
  await resetDemo(page);
  await page.goto("/vulnerabilities");
  await page.getByTestId("vuln-add").click();

  // client-side validation
  await page.getByTestId("vf-id").fill("vuln-tomcat-rce");
  await page.getByTestId("vf-title").fill("Tomcat deserialization RCE");
  await page.getByTestId("vf-kind").selectOption("remote_service");
  await page.getByTestId("vf-asset").selectOption("app-01");
  await page.getByTestId("vf-port").selectOption("8080");
  await page.getByTestId("vf-cvss").fill("11");
  await page.getByTestId("vf-mitre").fill("T1190, X99");
  await page.getByTestId("vuln-save").click();
  await expect(page.getByText("CVSS must be between 0 and 10.")).toBeVisible();
  await expect(page.getByText("Use ATT&CK ids such as T1190 or T1558.003.")).toBeVisible();

  await page.getByTestId("vf-cvss").fill("9.1");
  await page.getByTestId("vf-maturity").fill("0.8");
  await page.getByTestId("vf-mitre").fill("T1190");
  await page.getByTestId("vuln-save").click();
  await expect(page.getByTestId("toast").filter({ hasText: "Finding added" })).toBeVisible();
  await expect(page.getByTestId("vuln-row-vuln-tomcat-rce")).toBeVisible();

  // edit
  await page.getByTestId("vuln-row-vuln-tomcat-rce").click();
  await page.getByTestId("vuln-edit").click();
  await expect(page.getByTestId("vf-id")).toBeDisabled();
  await page.getByTestId("vf-cvss").fill("7.4");
  await page.getByTestId("vf-title").fill("Tomcat deserialization RCE (vendor advisory)");
  await page.getByTestId("vuln-save").click();
  await expect(page.getByTestId("toast").filter({ hasText: "Finding updated" })).toBeVisible();
  const detail = page.getByTestId("vuln-detail");
  await expect(detail).toContainText("Tomcat deserialization RCE (vendor advisory)");
  await expect(page.getByTestId("vuln-row-vuln-tomcat-rce")).toContainText("7.4");
  const vulns = await (await request.get(`${API}/twins/northwind/vulnerabilities`)).json();
  const saved = vulns.find((v: { id: string }) => v.id === "vuln-tomcat-rce");
  expect(saved).toMatchObject({ cvss: 7.4, affected_asset: "app-01", affected_port: 8080, mitre_techniques: ["T1190"] });

  // server-side validation surfaces verbatim (port closed after editing the asset is caught client-side,
  // so trigger the server: duplicate id)
  await page.getByTestId("vuln-add").click();
  await page.getByTestId("vf-id").fill("vuln-tomcat-rce");
  await page.getByTestId("vf-title").fill("dup");
  await page.getByTestId("vf-asset").selectOption("app-01");
  await page.getByTestId("vuln-save").click();
  await expect(page.getByText("This id is already used in this twin.")).toBeVisible();
});

test("revision picker runs a scenario on an older revision", async ({ page, request }) => {
  await resetDemo(page);
  // create r2: close SSH by applying the top recommendation through the API
  const recs = await (await request.get(`${API}/recommendations?twin=northwind&scenario=sensitive_data_exposure`)).json();
  const applied = await request.post(`${API}/remediations/apply`, {
    data: { twin_id: "northwind", scenario: "sensitive_data_exposure", actions: [recs.recommendations[0].action] },
  });
  expect(applied.ok()).toBeTruthy();

  await page.goto("/simulate");
  await page.getByTestId("scenario-sensitive_data_exposure").click();
  await expect(page.getByTestId("run-revision").locator("option")).toHaveCount(2);
  await page.getByTestId("run-revision").selectOption("1");
  await page.getByTestId("run-simulation").click();
  const toast = page.getByTestId("toast").filter({ hasText: "on r1 finished" });
  await expect(toast).toBeVisible();
  await toast.getByRole("button", { name: "Open the result" }).click();
  await expect(page.getByTestId("sim-revision")).toHaveAttribute("data-revision", "1");
  await replayToEnd(page);
  await expect(page.getByTestId("sim-score")).toHaveText("25");
  // the map shows r1's model: the internet-facing SSH path is drawn
  await expect(page.getByTestId("sim-map").locator('[data-attack="true"]')).toHaveCount(4);

  // and the latest revision gives the remediated score
  await page.getByTestId("run-revision").selectOption("head");
  await page.getByTestId("run-simulation").click();
  // wait for the toast of THIS run (the r1 toast can still be on screen)
  await page.getByTestId("toast").filter({ hasText: "on r2 finished" }).getByRole("button", { name: "Open the result" }).click();
  await expect(page.getByTestId("sim-revision")).toHaveAttribute("data-revision", "2");
  await expect(page.getByTestId("sim-score")).toHaveText("100");
});

import { expect, test } from "@playwright/test";
import { API, resetDemoApi } from "./env";

// Opt-in: E2E_AI_PROVIDER=ollama E2E_AI_MODEL=qwen2.5:7b E2E_AI_BASE_URL=http://localhost:11434 npx playwright test ai-live
test.skip(process.env.E2E_AI_PROVIDER !== "ollama", "live LLM test runs only with E2E_AI_PROVIDER=ollama");

test.beforeAll(async ({ request }) => {
  await resetDemoApi(request);
});

test("assistant streams a live LLM explanation with mode + post-check", async ({ page, request }) => {
  test.setTimeout(300_000);
  const api = API;
  const run = await (await request.post(`${api}/simulations`, { data: { twin_id: "northwind", scenario: "sensitive_data_exposure" } })).json();
  await page.addInitScript(() => localStorage.setItem("cybertwin.lang", "en"));
  await page.goto(`/assistant?run=${run.id}`);
  await expect(page.getByTestId("ai-mode")).toHaveAttribute("data-mode", "llm", { timeout: 30_000 });
  await expect(page.getByTestId("ai-mode")).toContainText("ollama");
  // wait for the stream to finish (Regenerate re-enabled)
  await expect(page.getByRole("button", { name: "Regenerate" })).toBeEnabled({ timeout: 240_000 });
  const text = (await page.getByTestId("explanation").textContent()) ?? "";
  expect(text.length).toBeGreaterThan(200);
  await expect(page.getByTestId("integrity-checks")).toBeVisible();
  const violations = await page.getByTestId("integrity-checks").getAttribute("data-violations");
  console.log(`integrity violations shown in UI: ${violations}`);
  await expect(page.getByTestId("explanation")).toContainText("P1.S1");
  const flagged = await page.getByTestId("unverified-mark").count();
  console.log(`live LLM explanation: ${text.length} chars, ${flagged} unverified mark(s)`);
  await page.screenshot({ path: "../docs/screenshots/09-ai-assistant-live-ollama-en.png" });
});

import { expect, type APIRequestContext, type Page } from "@playwright/test";

// Where the stack under test lives. Defaults: local uvicorn (8765) + vite (5199) started by playwright.config.ts.
// Against Docker: E2E_BASE_URL=http://localhost:8080 (nginx serves the build and proxies /api to the backend).
export const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:5199";
export const API = process.env.E2E_API_URL ?? (process.env.E2E_BASE_URL ? `${process.env.E2E_BASE_URL}/api/v1` : "http://127.0.0.1:8765/api/v1");

/** Show the end state of the replay (after a run the replay auto-plays from the first step). */
export async function replayToEnd(page: Page): Promise<void> {
  const scrubber = page.getByTestId("scrubber");
  await expect(scrubber).toBeVisible();
  await scrubber.fill((await scrubber.getAttribute("max")) ?? "0");
}

// Every spec file calls this in beforeAll so it never depends on the DB state another spec left behind.
export async function resetDemoApi(request: APIRequestContext): Promise<void> {
  const res = await request.post(`${API}/demo/reset`);
  expect(res.ok(), `POST /demo/reset -> ${res.status()}`).toBeTruthy();
}

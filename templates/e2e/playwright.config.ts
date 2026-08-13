import { defineConfig, devices } from "@playwright/test";

// @adr 001 - the pair under test is NOT started here
//
// No webServer block, on purpose: this repo owns the suites, the WORKSPACE owns
// the runtime pair (its `pnpm ws:up` starts the api via compose and the built
// web preview, then prints the URLs). E2E_WEB_URL / E2E_API_URL point the
// suites at whatever pair the operator or the workspace CI brought up; the
// defaults match ws-up's. When a service is unreachable the suites skip with a
// note locally and hard-fail under CI=1 (e2e/support/services.ts).
export default defineConfig({
  testDir: "e2e",
  testMatch: ["**/*.spec.ts"],
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: process.env.E2E_WEB_URL ?? "http://localhost:4173",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});

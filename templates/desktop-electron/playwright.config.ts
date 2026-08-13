import { defineConfig, devices } from "@playwright/test";

// E2E specs live in e2e/ and alongside features (src/**/*.e2e.ts). Playwright
// builds + previews the real app (no dev-server mocking of the app's own logic).
export default defineConfig({
  testDir: ".",
  testMatch: ["e2e/**/*.e2e.ts", "src/**/*.e2e.ts"],
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // The json reporter is quality:report's machine input (BR-36): the e2e counts
  // land in test-results/e2e-results.json alongside the human reporter.
  reporter: [
    process.env.CI ? ["github" as const] : ["list" as const],
    ["json" as const, { outputFile: "test-results/e2e-results.json" }],
  ],
  use: {
    baseURL: "http://localhost:4173",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // VITE_HARNESS=1 adds harness.html as a second entry point. The layering suite
    // needs it: proving a popup escapes a stacking trap requires a page that HAS
    // one, and that adversarial fixture does not belong in the application. The
    // production `pnpm build` is unaffected, and `budget` refuses to measure a
    // harness build so the extra entry can never be mistaken for shipped weight.
    command: "VITE_HARNESS=1 pnpm build && pnpm preview --port 4173 --strictPort",
    url: "http://localhost:4173",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});

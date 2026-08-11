import { defineConfig, devices } from "@playwright/test";

// E2E specs live in e2e/ and alongside features (src/**/*.e2e.ts). Playwright
// builds + previews the real app (no dev-server mocking of the app's own logic).
export default defineConfig({
  testDir: ".",
  testMatch: ["e2e/**/*.e2e.ts", "src/**/*.e2e.ts"],
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: "http://localhost:4173",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // VITE_GALLERY=1 adds gallery.html as a second entry point. e2e/overlay.e2e.ts
    // needs it: proving a popup escapes a stacking trap requires a page that HAS
    // one, and that adversarial fixture does not belong in the application. The
    // production `pnpm build` is unaffected, and `budget` refuses to measure a
    // gallery build so the extra entry can never be mistaken for shipped weight.
    command: "VITE_GALLERY=1 pnpm build && pnpm preview --port 4173 --strictPort",
    url: "http://localhost:4173",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});

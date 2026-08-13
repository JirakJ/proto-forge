/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

// CSP + security headers (BRS §4.1). The preview server (built bundle) sets the
// STRICT policy a deployment must replicate — documented in docs/SECURITY.md. Dev
// relaxes script-src because Vite injects an inline react-refresh preamble, and
// keeps ws: for HMR. style-src carries 'unsafe-inline' in BOTH profiles: React
// writes style="" attributes (the overlay anchor/fallback positioning), and
// style-src-attr honours only 'unsafe-inline'/'unsafe-hashes' — a nonce cannot
// cover attributes, so claiming one here would be theatre.
const headers = (scriptSrc: string, connectSrc: string): Record<string, string> => ({
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Frame-Options": "DENY",
  "Content-Security-Policy": [
    "default-src 'self'",
    scriptSrc,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    connectSrc,
    "font-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
  ].join("; "),
});

// Dev: HMR + react-refresh need inline/eval and a websocket. Preview is strict:
// the built bundle opens no websocket, so scheme-only ws: (any host!) goes too.
const DEV_HEADERS = headers("script-src 'self' 'unsafe-inline' 'unsafe-eval'", "connect-src 'self' ws:");
const STRICT_HEADERS = headers("script-src 'self'", "connect-src 'self'");

const applyHeaders =
  (h: Record<string, string>) =>
  (server: {
    middlewares: { use: (fn: (req: unknown, res: { setHeader: (k: string, v: string) => void }, next: () => void) => void) => void };
  }) => {
    server.middlewares.use((_req, res, next) => {
      for (const [k, v] of Object.entries(h)) res.setHeader(k, v);
      next();
    });
  };

// The component harness is a second HTML entry point, added to the Rollup input
// only when VITE_HARNESS=1 (`pnpm docs:shots`, `pnpm test:e2e`). A production
// `pnpm build` never sees harness.html, so the catalogue cannot leak into the
// shipped bundle or move the performance budget — and there is no runtime flag
// to get wrong.
const withHarness = process.env.VITE_HARNESS === "1";
const html = (name: string) => fileURLToPath(new URL(`./${name}`, import.meta.url));

export default defineConfig({
  plugins: [
    react(),
    {
      name: "proto-forge-security-headers",
      configureServer: applyHeaders(DEV_HEADERS),
      configurePreviewServer: applyHeaders(STRICT_HEADERS),
    },
  ],
  build: {
    rollupOptions: {
      input: withHarness ? { main: html("index.html"), harness: html("harness.html") } : { main: html("index.html") },
    },
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "@jj/proto-ui": fileURLToPath(new URL("./packages/proto-ui/src/index.ts", import.meta.url)),
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}", "packages/proto-ui/src/**/*.test.{ts,tsx}"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
      include: ["src/**/*.{ts,tsx}", "packages/proto-ui/src/**/*.{ts,tsx}", "packages/proto-ui/tokens.ts", "packages/proto-ui/providers/**/*.tsx"],
      // LOCKED by scripts/coverage-policy.mjs: every entry must be on its allow-list
      // and carry the reason stated there. A new kind of exclusion is a gate edit and
      // an ADR, not a config tweak — the list is a record, not a dumping ground.
      exclude: [
        // tests and their fixtures are not product code
        "**/*.test.*",
        // tests and their fixtures are not product code
        "**/*.e2e.*",
        // tests and their fixtures are not product code
        "**/__fixtures__/**",
        // test infrastructure: the setup assertions and the fixture factory
        "src/test/**",
        // bootstrap entry: renders <App/> into #root, covered end-to-end by e2e/shell
        "src/main.tsx",
        // fixture catalogue for screenshots and browser tests, never in a production build
        "src/harness/**",
        // declarations carry no executable code
        "src/i18n/resources.d.ts",
        // declarations carry no executable code
        "**/*.d.ts",
      ],
      // 100 on every glob (BRS §3.1, revised by ADR 003): the layered floors
      // under-protected the feature layer that carries the product logic, and a floor
      // below 100 is a standing licence for untested branches. What keeps this honest
      // rather than performative is the pair of gates around it: coverage:policy locks
      // this list and the exclusions (a fourth exclusion fails), and test:mutation
      // proves the assertions fire. A genuinely unreachable line is a design problem
      // to fix, not a threshold problem to lower.
      thresholds: {
        "packages/proto-ui/src/**": { statements: 100, branches: 100, functions: 100, lines: 100 },
        "packages/proto-ui/tokens.ts": { statements: 100, branches: 100, functions: 100, lines: 100 },
        "packages/proto-ui/providers/**": { statements: 100, branches: 100, functions: 100, lines: 100 },
        "src/domain/**": { statements: 100, branches: 100, functions: 100, lines: 100 },
        "src/infra/**": { statements: 100, branches: 100, functions: 100, lines: 100 },
        "src/features/**": { statements: 100, branches: 100, functions: 100, lines: 100 },
        "src/app/**": { statements: 100, branches: 100, functions: 100, lines: 100 },
        "src/config/**": { statements: 100, branches: 100, functions: 100, lines: 100 },
        "src/shared/**": { statements: 100, branches: 100, functions: 100, lines: 100 },
        "src/i18n/**": { statements: 100, branches: 100, functions: 100, lines: 100 },
      },
    },
  },
});

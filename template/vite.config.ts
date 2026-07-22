/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

// CSP + security headers (BRS §4.1). Prod deployment must set the STRICT policy —
// documented in docs/SECURITY.md. Dev relaxes script-src because Vite injects an
// inline react-refresh preamble that a strict 'self' policy would block.
const headers = (scriptSrc: string): Record<string, string> => ({
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Frame-Options": "DENY",
  "Content-Security-Policy": [
    "default-src 'self'",
    scriptSrc,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "connect-src 'self' ws:",
    "font-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
  ].join("; "),
});

// Dev: HMR + react-refresh need inline/eval. Preview (built bundle) is strict.
const DEV_HEADERS = headers("script-src 'self' 'unsafe-inline' 'unsafe-eval'");
const STRICT_HEADERS = headers("script-src 'self'");

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

export default defineConfig({
  plugins: [
    react(),
    {
      name: "proto-forge-security-headers",
      configureServer: applyHeaders(DEV_HEADERS),
      configurePreviewServer: applyHeaders(STRICT_HEADERS),
    },
  ],
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
      include: ["src/**/*.{ts,tsx}", "packages/proto-ui/src/**/*.{ts,tsx}"],
      exclude: [
        "**/*.test.*",
        "**/*.e2e.*",
        "**/__fixtures__/**",
        "src/test/**",
        "src/main.tsx",
        "src/i18n/resources.d.ts",
        "**/*.d.ts",
      ],
      // Layered thresholds by architectural boundary (BRS §3.1). A file below its
      // layer's floor fails the gate. Waivers require an accepted ADR (adr-lint checks).
      thresholds: {
        "packages/proto-ui/src/**": { statements: 100, branches: 100, functions: 100, lines: 100 },
        "src/domain/**": { statements: 100, branches: 100, functions: 100, lines: 100 },
        "src/infra/**": { statements: 100, branches: 95, functions: 100, lines: 100 },
        "src/features/**": { statements: 85, branches: 80, functions: 85, lines: 85 },
        "src/app/**": { statements: 80, branches: 75, functions: 80, lines: 80 },
        "src/config/**": { statements: 80, branches: 75, functions: 80, lines: 80 },
      },
    },
  },
});

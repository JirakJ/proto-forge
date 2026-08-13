import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
      include: ["src/**/*.ts"],
      // LOCKED by scripts/coverage-policy.mjs: every entry must be on its allow-list
      // and carry the reason stated there. A new kind of exclusion is a gate edit and
      // an ADR, not a config tweak — the list is a record, not a dumping ground.
      exclude: [
        // tests and their fixtures are not product code
        "**/*.test.*",
        // tests and their fixtures are not product code
        "**/__fixtures__/**",
        // test infrastructure: the setup assertions and the fixture factory
        "src/test/**",
        // bootstrap entry: opens the listening socket, covered by the e2e conformance run
        "src/main.ts",
        // scenario catalogue for docs examples and the e2e suite, never in a production build
        "src/harness/**",
        // e2e composition roots: exercised by the conformance run itself, not by unit tests
        "src/e2e/**",
      ],
      // 100 on every glob (BRS §3.1): the layers carry the product logic, and a floor
      // below 100 is a standing licence for untested branches. The HTTP adapter is
      // exercised in-process through fastify.inject, the persistence adapter against
      // a real in-process Postgres engine (PGlite, BRS §15) — so nothing here needs a
      // lower bar. What keeps this honest is the pair of gates around it:
      // coverage:policy locks this list, test:mutation proves the assertions fire.
      thresholds: {
        "src/domain/**": { statements: 100, branches: 100, functions: 100, lines: 100 },
        "src/application/**": { statements: 100, branches: 100, functions: 100, lines: 100 },
        "src/adapters/**": { statements: 100, branches: 100, functions: 100, lines: 100 },
        "src/platform/**": { statements: 100, branches: 100, functions: 100, lines: 100 },
        "src/config/**": { statements: 100, branches: 100, functions: 100, lines: 100 },
      },
    },
  },
});

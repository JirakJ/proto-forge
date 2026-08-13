import { spawnSync } from "node:child_process";
import { fail, ok } from "./lib.mjs";

// @adr 006 - the operator's migration runner (support tool, not a gate)
//   DATABASE_URL=jdbc:postgresql://... pnpm db:migrate
//
// Delegates to `./gradlew dbMigrate` (app.MigrateMainKt): Flyway applies
// src/main/resources/db/migration in version order against the named database,
// transactionally, recording applied versions in flyway_schema_history — a re-run
// is idempotent and a failed migration rolls back. Verify-time schema testing
// does NOT go through here: the native tier runs the same history inside
// Testcontainers Postgres (BRS §15).

const url = process.env.DATABASE_URL;
if (!url) fail("db:migrate — DATABASE_URL is not set; name the database to migrate");

const run = spawnSync("./gradlew", ["dbMigrate", "-q", "--console=plain"], {
  stdio: "inherit",
  env: process.env,
});
if (run.error || run.status !== 0) {
  fail("db:migrate — the Flyway run failed", [(run.error?.message ?? "").slice(0, 300)]);
}
ok("db:migrate: migrations applied");

import { spawnSync } from "node:child_process";
import { fail, ok } from "./lib.mjs";

// @adr 006 - the operator's migration runner (support tool, not a gate)
//   DATABASE_URL=postgres://... pnpm db:migrate
//
// Delegates to the app's `--migrate` console mode: EF Core applies the committed
// Migrations/ history in order against the named database, transactionally,
// recording applied versions in __EFMigrationsHistory — a re-run is idempotent.
// Verify-time schema testing does NOT go through here: the native tier runs the
// same history inside Testcontainers Postgres (BRS §15, §19.9).

const url = process.env.DATABASE_URL;
if (!url) fail("db:migrate — DATABASE_URL is not set; name the database to migrate");

const run = spawnSync("dotnet", ["run", "--project", "src/App", "--", "--migrate"], {
  stdio: "inherit",
  env: process.env,
});
if (run.error || run.status !== 0) {
  fail("db:migrate — the EF Core migration run failed", [(run.error?.message ?? "").slice(0, 300)]);
}
ok("db:migrate: migrations applied");

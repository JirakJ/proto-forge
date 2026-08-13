import { spawnSync } from "node:child_process";
import { walk, fail, ok } from "./lib.mjs";

// @adr 006 - the operator's migration runner (support tool, not a gate)
//   DATABASE_URL=postgresql+psycopg://... pnpm db:migrate
//
// Applies alembic/versions/*.py in revision order against the named database via
// `uv run alembic upgrade head` — alembic records applied revisions in
// alembic_version, so a re-run is idempotent. Verify-time schema testing does
// NOT go through here: Python has no in-process Postgres engine, so the
// real-database tier is tests/integration against Testcontainers Postgres,
// mandatory in CI (BRS §15/§19).

const url = process.env.DATABASE_URL;
if (!url) fail("db:migrate — DATABASE_URL is not set; name the database to migrate");

const files = walk("alembic/versions", (p) => p.endsWith(".py")).sort();
if (files.length === 0) fail("db:migrate — no migrations in alembic/versions/");

const run = spawnSync("uv", ["run", "alembic", "upgrade", "head"], {
  stdio: "inherit",
  env: { ...process.env, DATABASE_URL: url },
});
if (run.error || run.status !== 0) {
  fail("db:migrate — alembic upgrade head failed", [(run.error?.message ?? "").slice(0, 300)]);
}
ok(`db:migrate: ${files.length} migration file(s) applied or already in place (alembic upgrade head)`);

import { readFileSync } from "node:fs";
import { walk, fail, ok } from "./lib.mjs";

// @adr 006 - the operator's migration runner (support tool, not a gate)
//   DATABASE_URL=postgres://... pnpm db:migrate
//
// Applies db/migrations/*.sql in filename order against the named database, one
// transaction per file, recording applied names in _migrations — so a re-run is
// idempotent and a half-applied migration rolls back rather than leaving a
// half-migrated schema. Verify-time schema testing does NOT go through here: the
// unit suite runs migrations against an in-process engine (PGlite, BRS §15).

const url = process.env.DATABASE_URL;
if (!url) fail("db:migrate — DATABASE_URL is not set; name the database to migrate");

const files = walk("db/migrations", (p) => p.endsWith(".sql")).sort();
if (files.length === 0) fail("db:migrate — no migrations in db/migrations/");

const { default: pg } = await import("pg");
const client = new pg.Client({ connectionString: url });
await client.connect();

try {
  await client.query("CREATE TABLE IF NOT EXISTS _migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())");
  const applied = new Set((await client.query("SELECT name FROM _migrations")).rows.map((r) => r.name));

  let ran = 0;
  for (const file of files) {
    const name = file.split("/").pop();
    if (applied.has(name)) continue;
    await client.query("BEGIN");
    try {
      await client.query(readFileSync(file, "utf8"));
      await client.query("INSERT INTO _migrations (name) VALUES ($1)", [name]);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      fail(`db:migrate — ${name} failed and was rolled back`, [String(error.message ?? error).slice(0, 300)]);
    }
    ran += 1;
  }
  ok(`db:migrate: ${ran} migration(s) applied, ${applied.size} already in place`);
} finally {
  await client.end();
}

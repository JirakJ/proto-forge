import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import pg from "pg";

// @adr 006 - one adapter, two injected drivers, always a real Postgres engine
//
// Persistence tests and `pnpm verify` run against PGlite — actual Postgres
// compiled to WASM, executing the shipped migrations — so the suite is offline
// and Docker-free while never mocking the database (§15). Deployments pass
// DATABASE_URL and get a node-postgres pool through the same adapter; only the
// driver behind this factory differs.

export type NotesDb = PgDatabase<PgQueryResultHKT>;

export type DbHandle = {
  db: NotesDb;
  close: () => Promise<void>;
};

// Anchored to this file, five levels below the package root — the same depth
// in src/ and in the built dist/, so tsx, tests and node dist/main.js agree.
const MIGRATIONS_DIR = join(fileURLToPath(import.meta.url), "..", "..", "..", "..", "..", "db", "migrations");

/**
 * Pool construction is lazy and side-effect free — no connection is opened until
 * the first query — so composition can happen before the network exists.
 */
export function makePgDb(databaseUrl: string): DbHandle {
  const pool = new pg.Pool({ connectionString: databaseUrl });
  return { db: drizzlePg(pool), close: () => pool.end() };
}

/** In-process engine: boots empty, then replays db/migrations in filename order. */
export async function makePgliteDb(): Promise<DbHandle> {
  const client = new PGlite();
  for (const name of migrationFiles()) {
    await client.exec(readFileSync(join(MIGRATIONS_DIR, name), "utf8"));
  }
  return { db: drizzlePglite(client), close: () => client.close() };
}

function migrationFiles(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith(".sql"))
    .sort();
}

export function makeDb(databaseUrl?: string): Promise<DbHandle> {
  return databaseUrl === undefined ? makePgliteDb() : Promise.resolve(makePgDb(databaseUrl));
}

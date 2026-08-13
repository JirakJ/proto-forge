import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { read, walk, ok, fail } from "./lib.mjs";
import { gateResult } from "./config.mjs";

// @adr 006 - migrations are append-only and agree with the model (BR-24)
//
// db/migrations/ is history: an existing migration is never edited or deleted (a
// correction is a NEW migration), and the lock is the proof —
// .proto-forge/migrations.lock pins every migration's sha256. `--write` appends
// entries for new files and REFUSES to change an existing one: the ledger itself
// is append-only, so "regenerate the lock" can never launder a rewrite.
//
// Model agreement, mechanically: every table the migrations CREATE must appear in
// the drizzle model (src/adapters/out/persistence/db.ts), and every pgTable(...)
// the model declares must be produced by some migration. A hash-based schema
// proof would need drizzle-kit at verify time; the name-level check catches the
// real failure (a model the migrations do not produce) without the dependency.

const DIR = "db/migrations";
const LOCK = ".proto-forge/migrations.lock";
const MODEL = "src/adapters/out/persistence/db.ts";
const NAME = /^\d{4}_[a-z0-9-]+\.sql$/;

const sha256 = (text) => createHash("sha256").update(text).digest("hex");

const files = walk(DIR, (p) => p.endsWith(".sql"))
  .map((p) => p.split("/").pop())
  .sort();
const errors = [];

// --- naming and ordering ------------------------------------------------------
const numbers = new Set();
for (const name of files) {
  if (!NAME.test(name)) {
    errors.push(`${DIR}/${name}: migrations are named NNNN_name.sql (zero-padded, kebab-case)`);
    continue;
  }
  const n = Number(name.slice(0, 4));
  if (numbers.has(n)) errors.push(`${DIR}/${name}: number ${n} is used twice — the history has one order, and two files cannot share a place in it`);
  numbers.add(n);
}

// --- destructive statements require a recorded decision -----------------------
for (const name of files) {
  const sql = read(`${DIR}/${name}`);
  if (/\b(DROP|TRUNCATE)\b/i.test(sql) && !/--\s*@adr\s+\d+/.test(sql)) {
    errors.push(`${DIR}/${name}: contains DROP/TRUNCATE without an \`-- @adr NNN\` marker — destruction is a recorded decision (BR-24)`);
  }
}

// --- the append-only ledger ---------------------------------------------------
const lock = existsSync(LOCK) ? JSON.parse(read(LOCK)) : { files: {} };
const locked = lock.files ?? {};

if (process.argv.includes("--write")) {
  const next = { ...locked };
  let added = 0;
  for (const name of files) {
    const hash = sha256(read(`${DIR}/${name}`));
    if (next[name] === undefined) {
      next[name] = hash;
      added += 1;
    } else if (next[name] !== hash) {
      fail(`migrations.lock refuses to re-pin ${name}`, [
        "The ledger is append-only: an existing migration never changes.",
        "A correction is a NEW migration; if the file was edited by mistake, restore it from git.",
      ]);
    }
  }
  mkdirSync(".proto-forge", { recursive: true });
  writeFileSync(LOCK, JSON.stringify({ files: next }, null, 2) + "\n");
  ok(`migrations.lock: ${added} new entr${added === 1 ? "y" : "ies"} appended, ${Object.keys(locked).length} existing pins untouched`);
  process.exit(0);
}

if (!existsSync(LOCK)) {
  // A service with no migrations yet has an EMPTY history, which is a valid one.
  // The moment the first migration lands, the ledger becomes mandatory — and the
  // committed snapshot's fileTree pins both, so neither can vanish silently.
  if (files.length > 0) {
    errors.push(`${LOCK} is missing — run: pnpm migration:verify --write (and commit the ledger)`);
  }
} else {
  for (const [name, pinned] of Object.entries(locked)) {
    if (!files.includes(name)) {
      errors.push(`${LOCK} pins ${name}, which no longer exists — a deleted migration is a rewritten history (BR-24)`);
      continue;
    }
    const actual = sha256(read(`${DIR}/${name}`));
    if (actual !== pinned) {
      errors.push(
        `${DIR}/${name}: a rewritten migration — its bytes no longer match the ledger; ` +
          `every environment that ran the old version now disagrees with every one that runs this (BR-24)`,
      );
    }
  }
  for (const name of files) {
    if (locked[name] === undefined) {
      errors.push(`${DIR}/${name}: not in ${LOCK} — append it with: pnpm migration:verify --write`);
    }
  }
}

// --- model agreement ----------------------------------------------------------
const createdTables = files.flatMap((name) => [...read(`${DIR}/${name}`).matchAll(/CREATE TABLE (?:IF NOT EXISTS )?"?(\w+)"?/gi)].map((m) => m[1]));
if (!existsSync(MODEL)) {
  if (files.length > 0) errors.push(`${MODEL} is missing — migrations create tables no model describes`);
} else {
  const model = read(MODEL);
  for (const table of createdTables) {
    if (!model.includes(table)) {
      errors.push(`${MODEL}: never mentions table "${table}", which the migrations create — the model and the history disagree (BR-24)`);
    }
  }
  for (const m of model.matchAll(/pgTable\(\s*"(\w+)"/g)) {
    if (!createdTables.includes(m[1])) {
      errors.push(`${MODEL}: pgTable("${m[1]}") is a model the migrations do not produce — add a migration, never an implicit sync (BR-24)`);
    }
  }
}

gateResult("migration", `migration:verify: ${files.length} migration(s), append-only ledger intact, model agrees`, errors);

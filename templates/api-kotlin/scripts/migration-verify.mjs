import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { read, walk, ok, fail } from "./lib.mjs";
import { gateResult } from "./config.mjs";

// @adr 006 - migrations are append-only and agree with the model (BR-24)
//
// src/main/resources/db/migration is history: an existing migration is never
// edited or deleted (a correction is a NEW migration), and the lock is the proof —
// .proto-forge/migrations.lock pins every migration's sha256. `--write` appends
// entries for new files and REFUSES to change an existing one: the ledger itself
// is append-only, so "regenerate the lock" can never launder a rewrite.
//
// Model agreement, mechanically and native-free: every table the migrations
// CREATE must appear as an Exposed `Table("…")` under the persistence adapter, and
// every table the adapter declares must be produced by some migration. The full
// proof — Flyway migrate plus a read-back of the live catalog against a real
// Postgres — runs in the NATIVE tier (`./gradlew nativeTest`); the name-level
// check here catches the real failure (a model the migrations do not produce)
// without a JVM or a database.

const DIR = "src/main/resources/db/migration";
const LOCK = ".proto-forge/migrations.lock";
const MODEL_DIR = "src/main/kotlin/app/adapters/out/persistence";
const NAME = /^V(\d{4})__[a-z0-9_]+\.sql$/;

const sha256 = (text) => createHash("sha256").update(text).digest("hex");

const files = walk(DIR, (p) => p.endsWith(".sql"))
  .map((p) => p.split("/").pop())
  .sort();
const errors = [];

// --- naming and ordering ------------------------------------------------------
// Flyway convention, pinned tight: V<NNNN>__<snake_case>.sql, zero-padded so the
// filename sort IS the version sort, versions strictly increasing, never reused.
const numbers = new Set();
let previous = 0;
for (const name of files) {
  const parsed = NAME.exec(name);
  if (parsed === null) {
    errors.push(`${DIR}/${name}: migrations are named VNNNN__name.sql (zero-padded, snake-case)`);
    continue;
  }
  const n = Number(parsed[1]);
  if (numbers.has(n)) errors.push(`${DIR}/${name}: version ${n} is used twice — the history has one order, and two files cannot share a place in it`);
  if (n <= previous) errors.push(`${DIR}/${name}: version ${n} does not increase on ${previous} — Flyway versions are strictly increasing`);
  numbers.add(n);
  previous = Math.max(previous, n);
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
const modelFiles = walk(MODEL_DIR, (p) => p.endsWith(".kt"));
if (modelFiles.length === 0) {
  if (files.length > 0) errors.push(`${MODEL_DIR} is missing — migrations create tables no Exposed table describes`);
} else {
  const model = modelFiles.map((p) => read(p)).join("\n");
  const declaredTables = [...model.matchAll(/:\s*Table\(\s*"(\w+)"/g)].map((m) => m[1]);
  for (const table of createdTables) {
    if (!declaredTables.includes(table)) {
      errors.push(`${MODEL_DIR}: no Table("${table}") object, which the migrations create — the model and the history disagree (BR-24)`);
    }
  }
  for (const table of declaredTables) {
    if (!createdTables.includes(table)) {
      errors.push(`${MODEL_DIR}: Table("${table}") is a model the migrations do not produce — add a migration, never an implicit sync (BR-24)`);
    }
  }
}

gateResult("migration", `migration:verify: ${files.length} migration(s), append-only ledger intact, model agrees`, errors);

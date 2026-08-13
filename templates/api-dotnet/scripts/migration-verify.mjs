import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { read, walk, ok, fail } from "./lib.mjs";
import { gateResult } from "./config.mjs";

// @adr 006 - migrations are append-only and agree with the model (BR-24)
//
// src/App/Adapters/Out/Persistence/Migrations is history: an existing migration
// is never edited or deleted (a correction is a NEW migration), and the lock is
// the proof — .proto-forge/migrations.lock pins every migration's sha256.
// `--write` appends entries for new files and REFUSES to change an existing one:
// the ledger itself is append-only, so "regenerate the lock" can never launder a
// rewrite. The ModelSnapshot is the ONE file EF legitimately rewrites per new
// migration, so it stays outside the ledger; its agreement with the history is
// the has-pending-model-changes proof below.
//
// Model agreement, mechanically and native-free: every table the migrations
// CreateTable must appear in a [Table("…")] attribute under the persistence
// adapter, and every [Table] the entities declare must be produced by some
// migration. The full proof — Database.Migrate plus HasPendingModelChanges
// (`dotnet ef migrations has-pending-model-changes`) against a real Postgres —
// runs in the NATIVE tier (pnpm test:native); the name-level check here catches
// the real failure (a model the migrations do not produce) without a dotnet
// toolchain or a database.

const DIR = "src/App/Adapters/Out/Persistence/Migrations";
const LOCK = ".proto-forge/migrations.lock";
const MODEL_DIR = "src/App/Adapters/Out/Persistence";
const NAME = /^(\d{14})_[A-Za-z][A-Za-z0-9]*(\.Designer)?\.cs$/;

const sha256 = (text) => createHash("sha256").update(text).digest("hex");

const all = walk(DIR, (p) => p.endsWith(".cs")).map((p) => p.split("/").pop()).sort();
// The rewriteable snapshot stays out of the append-only ledger.
const files = all.filter((name) => !name.endsWith("ModelSnapshot.cs"));
const migrations = files.filter((name) => !name.endsWith(".Designer.cs"));
const errors = [];

// --- naming and ordering ------------------------------------------------------
// EF Core convention, pinned tight: <utc-timestamp>_<PascalCaseName>.cs plus its
// .Designer.cs twin — the timestamp sort IS the version sort, strictly
// increasing, never reused.
const numbers = new Set();
let previous = "";
for (const name of files) {
  if (NAME.exec(name) === null) {
    errors.push(`${DIR}/${name}: migrations are named <timestamp>_<Name>.cs (14-digit UTC stamp, PascalCase name)`);
  }
}
for (const name of migrations) {
  const parsed = NAME.exec(name);
  if (parsed === null) continue;
  const stamp = parsed[1];
  if (numbers.has(stamp)) errors.push(`${DIR}/${name}: timestamp ${stamp} is used twice — the history has one order, and two files cannot share a place in it`);
  if (stamp <= previous && previous !== "") errors.push(`${DIR}/${name}: timestamp ${stamp} does not increase on ${previous} — EF migration stamps are strictly increasing`);
  numbers.add(stamp);
  previous = stamp > previous ? stamp : previous;
  if (!files.includes(name.replace(/\.cs$/, ".Designer.cs"))) {
    errors.push(`${DIR}/${name}: its .Designer.cs twin is missing — half a migration is not a migration`);
  }
}
if (migrations.length > 0 && !all.some((name) => name.endsWith("ModelSnapshot.cs"))) {
  errors.push(`${DIR}: no ModelSnapshot — EF cannot diff the model against the history`);
}

/** The Up() half of a migration — Down() legitimately drops what Up created. */
const upBody = (source) => {
  const up = source.indexOf("void Up(");
  const down = source.indexOf("void Down(");
  if (up === -1) return source;
  return source.slice(up, down === -1 ? source.length : down);
};

// --- destructive statements require a recorded decision -----------------------
for (const name of migrations) {
  const source = read(`${DIR}/${name}`);
  const up = upBody(source);
  if (/\.(DropTable|DropColumn|DropIndex)\(|\bSql\(\s*[@$]?"[^"]*\b(DROP|TRUNCATE)\b/i.test(up) && !/\/\/\s*@adr\s+\d+/.test(source)) {
    errors.push(`${DIR}/${name}: contains Drop/Truncate without a \`// @adr NNN\` marker — destruction is a recorded decision (BR-24)`);
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
const createdTables = migrations.flatMap((name) => [...upBody(read(`${DIR}/${name}`)).matchAll(/CreateTable\(\s*name:\s*"(\w+)"/g)].map((m) => m[1]));
const entityFiles = walk(MODEL_DIR, (p) => p.endsWith(".cs") && !p.includes("/Migrations/"));
if (entityFiles.length === 0) {
  if (migrations.length > 0) errors.push(`${MODEL_DIR} is missing — migrations create tables no entity describes`);
} else {
  const model = entityFiles.map((p) => read(p)).join("\n");
  const declaredTables = [...model.matchAll(/\[Table\("(\w+)"\)\]/g)].map((m) => m[1]);
  for (const table of createdTables) {
    if (!declaredTables.includes(table)) {
      errors.push(`${MODEL_DIR}: no [Table("${table}")] entity, which the migrations create — the model and the history disagree (BR-24)`);
    }
  }
  for (const table of declaredTables) {
    if (!createdTables.includes(table)) {
      errors.push(`${MODEL_DIR}: [Table("${table}")] is a model the migrations do not produce — add a migration, never an implicit sync (BR-24)`);
    }
  }
}

gateResult("migration", `migration:verify: ${migrations.length} migration(s), append-only ledger intact, model agrees`, errors);

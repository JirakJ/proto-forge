import { writeFileSync, existsSync } from "node:fs";
import { walk, read, fail, ok, hashTree } from "./lib.mjs";

// BR-14: structural determinism. The snapshot pins the content-independent shape.
// `--write` regenerates the baseline; default compares against the committed one.
function exportedNames(src) {
  const names = [];
  for (const m of src.matchAll(/export\s*\{([^}]*)\}/g)) {
    for (let spec of m[1].split(",")) {
      spec = spec.trim();
      if (!spec || spec.startsWith("type ")) continue; // skip type-only exports
      const parts = spec.split(/\s+as\s+/);
      names.push(parts[parts.length - 1].trim()); // the exported (aliased) name
    }
  }
  return names.filter((n) => /^[A-Z]/.test(n)).sort();
}

function buildSnapshot() {
  const fileTree = [
    ...walk("src", (f) => /\.(ts|tsx|json)$/.test(f)),
    ...walk("packages", (f) => /\.(ts|tsx|json)$/.test(f)),
    ...walk("docs/adr", (f) => f.endsWith(".md")),
    ...walk("scripts", (f) => f.endsWith(".mjs")),
    ...walk("e2e", (f) => f.endsWith(".ts")),
  ].sort();

  const adrSet = walk("docs/adr", (p) => p.endsWith(".md"))
    .sort()
    .map((p) => {
      const b = read(p);
      return {
        id: Number(p.match(/\/(\d+)-/)?.[1]),
        title: b.match(/# ADR \d+:\s*(.+)/)?.[1] ?? "",
        status: (b.match(/- Status:\s*(\w+)/)?.[1] ?? "").toLowerCase(),
      };
    });

  const components = exportedNames(read("packages/proto-ui/src/index.ts"));

  const pkg = JSON.parse(read("package.json"));
  const protoPkg = JSON.parse(read("packages/proto-ui/package.json"));
  const gates = Object.keys(pkg.scripts)
    .filter((s) => /^(lint|typecheck|test|i18n|stub|adr|prompt|dup|consistency|sec|snapshot):?/.test(s))
    .sort();

  return { fileTree, adrSet, components, gates, templateVersion: pkg.version, protoUiVersion: protoPkg.version };
}

const snap = buildSnapshot();
const path = ".proto-forge/snapshot.json";
const seedPath = ".proto-forge/seed.lock";
const SEED_DIR = "packages/proto-ui";

// Seed provenance (BRS §17.2). `--write-seed` is a deliberate, ADR-recorded
// bump — never run it to make a red gate green.
if (process.argv.includes("--write-seed")) {
  const prev = existsSync(seedPath) ? JSON.parse(read(seedPath)) : {};
  const protoPkg = JSON.parse(read(`${SEED_DIR}/package.json`));
  const lock = {
    package: "@jj/proto-ui",
    version: protoPkg.version,
    sha: prev.sha ?? null,
    sha256: hashTree(SEED_DIR),
    vendoredAt: SEED_DIR,
    note: "sha = upstream git commit of the skill release that vendored this seed; null until first published release. sha256 covers the vendored tree; snapshot:diff re-verifies it.",
  };
  writeFileSync(seedPath, JSON.stringify(lock, null, 2) + "\n");
  ok(`seed.lock written: ${lock.package}@${lock.version} sha256=${lock.sha256.slice(0, 12)}…`);
  process.exit(0);
}

function verifySeed() {
  if (!existsSync(seedPath)) fail("seed.lock missing — @jj/proto-ui provenance is mandatory (BRS §17.2)");
  const seed = JSON.parse(read(seedPath));
  if (!seed.sha256) fail("seed.lock has no sha256 — run: pnpm seed:lock (and record the bump in an ADR)");
  const actual = hashTree(seed.vendoredAt ?? SEED_DIR);
  if (seed.sha256 !== actual) {
    fail("seed integrity FAILED: vendored @jj/proto-ui differs from seed.lock", [
      `expected ${seed.sha256}`,
      `actual   ${actual}`,
      "The seed is byte-pinned (BRS §17.2). A legitimate upgrade = ADR + pnpm seed:lock; anything else is tamper/drift.",
    ]);
  }
}

if (process.argv.includes("--write")) {
  writeFileSync(path, JSON.stringify(snap, null, 2) + "\n");
  ok(`snapshot written: ${snap.fileTree.length} files, ${snap.adrSet.length} ADRs, ${snap.components.length} components`);
} else {
  verifySeed();
  if (!existsSync(path)) fail(`no committed snapshot at ${path} — run: pnpm snapshot`);
  const committed = JSON.parse(read(path));
  const diffs = [];
  // ADR titles are prose (LLM-varied); structural determinism (BRS §8, BR-14) compares
  // the decision SET — ids + statuses — not the titles. Titles stay in the file for humans.
  const structuralAdr = (set) => (set ?? []).map((a) => ({ id: a.id, status: a.status }));
  for (const key of ["fileTree", "components", "gates", "templateVersion", "protoUiVersion"]) {
    if (JSON.stringify(committed[key]) !== JSON.stringify(snap[key])) diffs.push(`${key} drifted from committed snapshot`);
  }
  if (JSON.stringify(structuralAdr(committed.adrSet)) !== JSON.stringify(structuralAdr(snap.adrSet))) {
    diffs.push("adrSet (ids/statuses) drifted from committed snapshot");
  }
  if (diffs.length) fail("snapshot:diff FAILED", diffs);
  ok("snapshot:diff: structure matches committed snapshot");
}

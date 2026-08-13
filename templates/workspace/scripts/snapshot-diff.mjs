import { writeFileSync, existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { walk, read, fail, ok } from "./lib.mjs";
import { checkConfig } from "./config.mjs";

// BR-14: structural determinism. The snapshot pins the content-independent shape.
// `--write` regenerates the baseline; default compares against the committed one.
//
// The byte-pinned seed of this template is the gate corpus itself (scripts/**) —
// the workspace ships no application code, so the scripts ARE the product. The
// tree is hashed into ONE digest in seed.lock; adding a file changes it as
// surely as editing one. The part directories are OTHER repositories (T14) and
// are deliberately outside both the seed and the snapshot: their integrity is
// their own snapshot:diff's job.

const SEED_DIRS = ["scripts"];

/** Deterministic content hash over a LIST of directory trees, as one digest. */
function hashSeed(dirs) {
  const h = createHash("sha256");
  const paths = dirs.flatMap((d) => walk(d)).sort();
  for (const p of paths) {
    h.update(p);
    h.update("\0");
    h.update(readFileSync(p));
  }
  return h.digest("hex");
}

function buildSnapshot() {
  const fileTree = [
    ...walk("scripts", (f) => f.endsWith(".mjs")),
    ...walk("docs/adr", (f) => f.endsWith(".md")),
    ...(existsSync("workspace.json") ? ["workspace.json"] : []),
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

  const pkg = JSON.parse(read("package.json"));
  // Read the gate list off `verify` itself rather than pattern-matching script
  // names. The question the snapshot answers is "which gates guard this run, in
  // what order" — a name-based filter silently omits every gate added later,
  // which is the one failure mode a provenance record must not have. Order is
  // preserved: verify is fail-fast, so it is part of the contract.
  const gates = [...(pkg.scripts.verify ?? "").matchAll(/pnpm run ([\w:-]+)/g)].map((m) => m[1]);

  // The register (§1) defines a conforming run by this field, so the snapshot must
  // actually carry it: "strict" with no live waivers, "waived" otherwise.
  const conformance = checkConfig().conformance;

  return { fileTree, adrSet, gates, conformance, templateVersion: pkg.version };
}

const snap = buildSnapshot();
const path = ".proto-forge/snapshot.json";
const seedPath = ".proto-forge/seed.lock";

// Seed provenance (BRS §17.2). `--write-seed` is a deliberate, ADR-recorded
// bump — never run it to make a red gate green.
if (process.argv.includes("--write-seed")) {
  const prev = existsSync(seedPath) ? JSON.parse(read(seedPath)) : {};
  const pkg = JSON.parse(read("package.json"));
  const lock = {
    seed: SEED_DIRS,
    version: pkg.version,
    sha: prev.sha ?? null,
    sha256: hashSeed(SEED_DIRS),
    note: "sha = upstream git commit of the skill release that vendored this seed; null until first published release. sha256 covers the gate corpus (scripts/**) as one digest; snapshot:diff re-verifies it.",
  };
  writeFileSync(seedPath, JSON.stringify(lock, null, 2) + "\n");
  ok(`seed.lock written: ${SEED_DIRS.join(" + ")} sha256=${lock.sha256.slice(0, 12)}…`);
  process.exit(0);
}

function verifySeed() {
  if (!existsSync(seedPath)) fail("seed.lock missing — gate-corpus provenance is mandatory (BRS §17.2)");
  const seed = JSON.parse(read(seedPath));
  if (!seed.sha256) fail("seed.lock has no sha256 — run: pnpm seed:lock (and record the bump in an ADR)");
  const actual = hashSeed(Array.isArray(seed.seed) ? seed.seed : SEED_DIRS);
  if (seed.sha256 !== actual) {
    fail("seed integrity FAILED: the gate corpus differs from seed.lock", [
      `expected ${seed.sha256}`,
      `actual   ${actual}`,
      "The seed is byte-pinned (BRS §17.2). A legitimate upgrade = ADR + pnpm seed:lock; anything else is tamper/drift.",
    ]);
  }
}

if (process.argv.includes("--write")) {
  writeFileSync(path, JSON.stringify(snap, null, 2) + "\n");
  ok(`snapshot written: ${snap.fileTree.length} files, ${snap.adrSet.length} ADRs, ${snap.gates.length} gates`);
} else {
  verifySeed();
  if (!existsSync(path)) fail(`no committed snapshot at ${path} — run: pnpm snapshot`);
  const committed = JSON.parse(read(path));
  const diffs = [];
  // ADR titles are prose (LLM-varied); structural determinism (BRS §8, BR-14) compares
  // the decision SET — ids + statuses — not the titles. Titles stay in the file for humans.
  const structuralAdr = (set) => (set ?? []).map((a) => ({ id: a.id, status: a.status }));
  for (const key of ["fileTree", "gates", "conformance", "templateVersion"]) {
    if (JSON.stringify(committed[key]) !== JSON.stringify(snap[key])) diffs.push(`${key} drifted from committed snapshot`);
  }
  if (JSON.stringify(structuralAdr(committed.adrSet)) !== JSON.stringify(structuralAdr(snap.adrSet))) {
    diffs.push("adrSet (ids/statuses) drifted from committed snapshot");
  }
  if (diffs.length) fail("snapshot:diff FAILED", diffs);
  ok("snapshot:diff: structure matches committed snapshot");
}

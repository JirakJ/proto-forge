import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";

const SKIP = new Set([
  "node_modules",
  "dist",
  "coverage",
  ".venv",
  "__pycache__",
  ".pytest_cache",
  ".mypy_cache",
  ".ruff_cache",
  "mutants",
]);

export function walk(dir, filter = () => true, acc = []) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return acc;
  }
  for (const e of entries) {
    if (SKIP.has(e.name)) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, filter, acc);
    else if (filter(p)) acc.push(p);
  }
  return acc;
}

export const read = (p) => readFileSync(p, "utf8");

// Deterministic content hash of a directory tree: sorted relative paths + raw
// bytes. Used for the platform-kernel + gate-corpus seed provenance (BRS §17.2).
export function hashTree(dir) {
  const h = createHash("sha256");
  for (const p of walk(dir).sort()) {
    h.update(p);
    h.update("\0");
    h.update(readFileSync(p));
  }
  return h.digest("hex");
}
// Content hash of an explicit file list, in the order given. Used to decide
// whether a documentation screenshot still shows today's component.
export function hashFiles(paths) {
  const h = createHash("sha256");
  for (const p of paths) {
    h.update(p);
    h.update("\0");
    h.update(readFileSync(p));
  }
  return h.digest("hex");
}

export const isCode = (p) => p.endsWith(".py");
// Production code = python source outside the test tree; per-gate filters
// additionally treat harness/e2e/__fixtures__ as the test surface they are.
export const isProd = (p) =>
  isCode(p) && !p.startsWith("tests/") && !/(^|\/)(test_[^/]+|conftest)\.py$/.test(p);

// CLI output: stdout for results, stderr for failures (the real logger for a tool).
export function fail(msg, lines = []) {
  process.stderr.write(`✗ ${msg}\n`);
  for (const l of lines) process.stderr.write(`    ${l}\n`);
  process.exit(1);
}

export function ok(msg) {
  process.stdout.write(`✓ ${msg}\n`);
}

export function note(msg) {
  process.stderr.write(`⚠ ${msg}\n`);
}

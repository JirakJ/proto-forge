import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";

const SKIP = new Set(["node_modules", "dist", "coverage", "playwright-report", "test-results"]);

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
// bytes. Used for @jj/proto-ui seed provenance (BRS §17.2).
export function hashTree(dir) {
  const h = createHash("sha256");
  for (const p of walk(dir).sort()) {
    h.update(p);
    h.update("\0");
    h.update(readFileSync(p));
  }
  return h.digest("hex");
}
export const isCode = (p) => /\.(ts|tsx)$/.test(p);
export const isProd = (p) => isCode(p) && !/\.(test|e2e)\./.test(p);

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

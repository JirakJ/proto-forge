import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";

const SKIP = new Set(["node_modules", "build", ".gradle", "bin", "coverage", "dist"]);

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
// whether a captured docs example still shows today's handler sources.
export function hashFiles(paths) {
  const h = createHash("sha256");
  for (const p of paths) {
    h.update(p);
    h.update("\0");
    h.update(readFileSync(p));
  }
  return h.digest("hex");
}

export const isCode = (p) => p.endsWith(".kt");
// Production code lives under src/main; src/test carries suites, fixtures and the harness.
export const isProd = (p) => isCode(p) && p.startsWith("src/main/");

// Kotlin escapes keyword package segments with backticks (app.adapters.`in`.http).
// Every gate that reasons about package names strips them first, so the source's
// escaping never leaks into a rule.
export const unquote = (spec) => spec.replaceAll("`", "");

// Comments out, before any gate reads a declaration. A KDoc paragraph that
// EXPLAINS the registry's shape ("read the operationId = … declarations") is
// prose, not a route — a gate that cannot tell the difference teaches people to
// write worse comments, which is the opposite of what it is for. Line comments
// first, then block comments, so a `//` inside a `/* … */` cannot survive.
export const stripComments = (source) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

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

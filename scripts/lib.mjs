import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

// Shared helpers for the PLUGIN-level gates (repo root). Deliberately dependency
// -free and separate from template/scripts/lib.mjs: these run over the plugin's
// own sources with the repo root as cwd, those run inside a generated prototype.
// Nothing may import across that boundary.

const SKIP = new Set(["node_modules", ".git", "dist", "coverage", ".scratch", "playwright-report", "test-results"]);

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
export const readJson = (p) => JSON.parse(readFileSync(p, "utf8"));

export const isMarkdown = (p) => p.endsWith(".md");

/**
 * Every ATX heading's text, trimmed, in document order. The citation gate resolves
 * identifiers against these, so the parse has to ignore fenced code blocks — a
 * `# comment` inside a shell example is not a heading.
 */
export function headings(markdown) {
  const out = [];
  let fenced = false;
  for (const line of markdown.split("\n")) {
    if (/^\s*(```|~~~)/.test(line)) {
      fenced = !fenced;
      continue;
    }
    if (fenced) continue;
    const m = /^(#{1,6})\s+(.+?)\s*$/.exec(line);
    if (m !== null) out.push(m[2]);
  }
  return out;
}

/** Markdown with fenced code blocks blanked out, so a gate never reads an example as a claim. */
export function withoutFences(markdown) {
  let fenced = false;
  return markdown
    .split("\n")
    .map((line) => {
      if (/^\s*(```|~~~)/.test(line)) {
        fenced = !fenced;
        return "";
      }
      return fenced ? "" : line;
    })
    .join("\n");
}

// stdout for results, stderr for failures.
export function fail(msg, lines = []) {
  process.stderr.write(`✗ ${msg}\n`);
  for (const l of lines) process.stderr.write(`    ${l}\n`);
  process.exit(1);
}

export function ok(msg) {
  process.stdout.write(`✓ ${msg}\n`);
}

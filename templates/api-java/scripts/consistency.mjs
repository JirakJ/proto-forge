import { existsSync } from "node:fs";
import { walk, read, isCode, fail, ok } from "./lib.mjs";

// BR-15 + BR-07: single-source-of-truth registries intact, accepted ADR titles are
// unique (no undeclared contradiction), and code is English-only.
//
// The backend's single sources: the config properties record (app.config.AppProperties),
// the problem catalogue (app.platform.Problems) and the route registry
// (app.adapter.in.web.RouteRegistry). A second definition of any of them is two
// places for one truth — the exact drift BR-15 exists to prevent.
const code = walk("src", isCode);
const errors = [];

const stripComments = (s) => s.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");

// [name, definition-regex, required]. Required registries must be defined exactly once.
const SINGLES = [
  ["config properties record", /@ConfigurationProperties\b/g, true],
  ["problem catalogue", /Map<String,\s*ProblemDef>\s+PROBLEMS\s*=/g, true],
  ["route table", /List<RouteDef>\s+ROUTES\s*=/g, true],
];
for (const [name, re, required] of SINGLES) {
  const count = code.reduce((n, f) => n + (stripComments(read(f)).match(re)?.length ?? 0), 0);
  if (required && count !== 1) errors.push(`single-source violation: ${name} defined ${count}x (expected 1)`);
  if (!required && count > 1) errors.push(`single-source violation: ${name} defined ${count}x (expected at most 1)`);
}

// --- runtime dependencies must be imported (BR-12's dead-weight corollary) -----
// The gate corpus is Node (§18) but carries ZERO npm runtime dependencies — the
// scripts are dependency-free by design (ADR 009). Any `dependencies` entry must
// therefore be imported by a gate script to justify its weight; the JVM runtime
// surface has its own gate (deps:budget over build.gradle.kts).
const pkg = existsSync("package.json") ? JSON.parse(read("package.json")) : {};
const scriptFiles = walk("scripts", (p) => p.endsWith(".mjs"));
for (const dep of Object.keys(pkg.dependencies ?? {})) {
  const imported = scriptFiles.some((f) => {
    const b = read(f);
    return b.includes(`from "${dep}"`) || b.includes(`from "${dep}/`) || b.includes(`import("${dep}`) || b.includes(`import "${dep}`);
  });
  if (!imported) {
    errors.push(`package.json dependency "${dep}" is imported by nothing in scripts/ — dead runtime weight`);
  }
}

const acceptedTitles = walk("docs/adr", (p) => p.endsWith(".md"))
  .map(read)
  .filter((b) => /- Status:\s*accepted/i.test(b))
  .map((b) => b.match(/# ADR \d+:\s*(.+)/)?.[1]);
const seen = new Set();
for (const t of acceptedTitles) {
  if (seen.has(t)) errors.push(`duplicate accepted ADR title: ${t}`);
  seen.add(t);
}

// English-only: flag non-Latin scripts in code. Covers Cyrillic/Greek/Hebrew/
// Arabic/Devanagari/Thai/Hangul/kana/CJK. The API speaks English (BR-23): the
// problem catalogue is the single source a frontend translates FROM.
const nonEnglish = /[Ѐ-ӿͰ-Ͽ֐-׿؀-ۿऀ-ॿ฀-๿가-힯぀-ヿ一-鿿]/;
for (const f of code) {
  if (nonEnglish.test(read(f))) errors.push(`${f}: non-English script in code (BR-07)`);
}

if (errors.length) fail("consistency FAILED", errors);
ok("consistency: single sources intact, ADRs unique, English-only");

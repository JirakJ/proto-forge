import { existsSync } from "node:fs";
import { walk, read, isCode, fail, ok } from "./lib.mjs";

// BR-15 + BR-07: single-source-of-truth registries intact, accepted ADR titles are
// unique (no undeclared contradiction), and code is English-only.
//
// The backend's single sources: the env schema (src/config/env.ts), the problem
// catalogue (src/platform/problems.ts) and the route registry
// (src/adapters/in/http/routes.ts). A second definition of any of them is two
// places for one truth — the exact drift BR-15 exists to prevent.
const code = walk("src", isCode);
const errors = [];

const stripComments = (s) => s.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");

// [name, definition-regex, required]. Required registries must be defined exactly
// once. The route-table pattern tolerates a type annotation (`routes: RouteDef[] =`).
const SINGLES = [
  ["env schema", /const EnvSchema\s*=/g, true],
  ["problem catalogue", /export const problems\b[^=;\n]*=/g, true],
  ["route table", /export const routes\b[^=;\n]*=/g, true],
];
for (const [name, re, required] of SINGLES) {
  const count = code.reduce((n, f) => n + (stripComments(read(f)).match(re)?.length ?? 0), 0);
  if (required && count !== 1) errors.push(`single-source violation: ${name} defined ${count}x (expected 1)`);
  if (!required && count > 1) errors.push(`single-source violation: ${name} defined ${count}x (expected at most 1)`);
}

// --- runtime dependencies must be imported (BR-12's dead-weight corollary) -----
// A `dependencies` entry nothing imports ships attack surface and download weight for
// no behaviour. Scoped to runtime deps on purpose: devDependencies are wired through
// configs and CLIs, where "is it used?" has no cheap mechanical answer.
const pkg = existsSync("package.json") ? JSON.parse(read("package.json")) : {};
for (const dep of Object.keys(pkg.dependencies ?? {})) {
  const imported = code.some((f) => {
    const b = read(f);
    return b.includes(`from "${dep}"`) || b.includes(`from "${dep}/`) || b.includes(`import("${dep}`) || b.includes(`import "${dep}`);
  });
  if (!imported) {
    errors.push(`package.json dependency "${dep}" is imported by nothing in src/ — dead runtime weight`);
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

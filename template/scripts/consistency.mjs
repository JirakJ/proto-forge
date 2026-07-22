import { walk, read, isCode, fail, ok } from "./lib.mjs";

// BR-15 + BR-07: single-source-of-truth registry intact, accepted ADR titles are
// unique (no undeclared contradiction), and code is English-only.
const code = [...walk("src", isCode), ...walk("packages", isCode)];
const errors = [];

const stripComments = (s) => s.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");

// [name, definition-regex, required]. Required registries must be defined exactly
// once; optional ones (a minimal app may have no router) must be defined at most once.
const SINGLES = [
  ["DEFAULT_LOCALE", /DEFAULT_LOCALE\s*=/g, true],
  ["design tokens", /export const tokens\s*=/g, true],
  ["env schema", /const EnvSchema\s*=/g, true],
  ["route table", /export const routes\s*=/g, false],
];
for (const [name, re, required] of SINGLES) {
  const count = code.reduce((n, f) => n + (stripComments(read(f)).match(re)?.length ?? 0), 0);
  if (required && count !== 1) errors.push(`single-source violation: ${name} defined ${count}x (expected 1)`);
  if (!required && count > 1) errors.push(`single-source violation: ${name} defined ${count}x (expected at most 1)`);
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

// English-only: flag non-Latin scripts in code, excluding locale catalogues
// (pseudo is intentionally decorated). Covers Cyrillic/Greek/Hebrew/Arabic/
// Devanagari/Thai/Hangul/kana/CJK.
const nonEnglish = /[Ѐ-ӿͰ-Ͽ֐-׿؀-ۿऀ-ॿ฀-๿가-힯぀-ヿ一-鿿]/;
for (const f of code) {
  if (/i18n\/locales\//.test(f)) continue;
  if (nonEnglish.test(read(f))) errors.push(`${f}: non-English script in code (BR-07)`);
}

if (errors.length) fail("consistency FAILED", errors);
ok("consistency: single sources intact, ADRs unique, English-only");

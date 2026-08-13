import { existsSync } from "node:fs";
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

// --- the CSS mirror of the design tokens (BR-15) ------------------------------
// The overlay stylesheet has to exist (::backdrop and @supports cannot be inline
// styles), which puts design values in two languages. They stay one source because the
// custom properties are DERIVED from `tokens` — and because this check re-derives them
// and compares. Two failure modes, both silent otherwise: a stylesheet using a var
// nothing produces (it resolves to nothing and the rule is skipped), and a literal
// colour or length smuggled in past the token set.
const TOKENS_FILE = "packages/proto-ui/tokens.ts";
const kebab = (v) => v.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

function tokenCssNames() {
  if (!existsSync(TOKENS_FILE)) return null;
  const src = read(TOKENS_FILE);
  const body = /export const tokens\s*=\s*\{([\s\S]*?)\n\} as const;/.exec(src)?.[1];
  if (body === undefined) return null;
  const names = new Set();
  // One level of nesting is all `tokens` has: groups of leaves, plus a few scalars.
  for (const m of body.matchAll(/(\w+):\s*\{([^}]*)\}/g)) {
    for (const leaf of m[2].matchAll(/(\w+)\s*:/g)) {
      names.add(`--pf-${kebab(m[1])}-${kebab(leaf[1])}`);
    }
  }
  const withoutGroups = body.replace(/(\w+):\s*\{[^}]*\}/g, "");
  for (const m of withoutGroups.matchAll(/^\s{2}(\w+):\s*["'\d]/gm)) names.add(`--pf-${kebab(m[1])}`);
  return names;
}

const cssFiles = walk("packages", (p) => p.endsWith(".css"));
const expected = tokenCssNames();
if (cssFiles.length > 0 && expected === null) {
  errors.push(`${TOKENS_FILE}: could not be parsed, so the CSS mirror cannot be verified`);
} else if (expected !== null) {
  for (const file of cssFiles) {
    // Comments are stripped first: this file documents its own contract, so prose
    // naming `var(--pf-*)` or quoting a colour must not read as a declaration.
    const declarations = read(file).replace(/\/\*[\s\S]*?\*\//g, "");
    for (const m of declarations.matchAll(/var\(\s*(--[\w-]+)/g)) {
      if (!expected.has(m[1])) {
        errors.push(`${file}: uses ${m[1]}, which ${TOKENS_FILE} does not produce — a var nothing defines resolves to nothing`);
      }
    }
    // Design literals: a hex colour, an rgb()/hsl() call, or a px length. Viewport and
    // relative units are layout, not design tokens, so they are allowed.
    for (const m of declarations.matchAll(/#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(|\b\d+px\b/g)) {
      errors.push(`${file}: literal design value "${m[0]}" — every value here is a var(--pf-*) from ${TOKENS_FILE} (BR-15)`);
    }
  }
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
    errors.push(`package.json dependency "${dep}" is imported by nothing in src/ or packages/ — dead runtime weight`);
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

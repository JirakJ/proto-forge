import { walk, read, isProd, fail, ok } from "./lib.mjs";

// BR-08/BR-09: en and pseudo catalogues share the same keys; every t('...') key
// used in code exists in en.
const flatten = (o, prefix = "", acc = {}) => {
  for (const [k, v] of Object.entries(o)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object") flatten(v, key, acc);
    else acc[key] = v;
  }
  return acc;
};

const enKeys = new Set(Object.keys(flatten(JSON.parse(read("src/i18n/locales/en.json")))));
const psKeys = new Set(Object.keys(flatten(JSON.parse(read("src/i18n/locales/pseudo.json")))));
const errors = [];

for (const k of enKeys) if (!psKeys.has(k)) errors.push(`pseudo missing key: ${k}`);
for (const k of psKeys) if (!enKeys.has(k)) errors.push(`pseudo orphan key: ${k}`);

const used = new Set();
const stripComments = (s) => s.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
for (const f of walk("src", isProd)) {
  // Matches t('x'), t("x") and t(`x`) (static keys; interpolated keys are skipped).
  // Comments are stripped first so an illustrative t('...') in a doc comment isn't counted.
  for (const m of stripComments(read(f)).matchAll(/\bt\(\s*[`"']([^`"'${}]+)[`"']/g)) used.add(m[1]);
}
for (const k of used) if (!enKeys.has(k)) errors.push(`missing en key used in code: ${k}`);

if (errors.length) fail("i18n:verify FAILED", errors);
ok(`i18n:verify: ${enKeys.size} keys, en/pseudo in sync, ${used.size} used keys present`);

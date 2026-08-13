import { existsSync, readdirSync } from "node:fs";
import { walk, read, isProd } from "./lib.mjs";
import { gateOptions, gateResult } from "./config.mjs";

// @adr 009 - i18n completeness is a hard gate, not a key-parity check
// BR-08/BR-09. The old version of this gate only compared en against pseudo and
// checked that used keys existed. Three things walked straight through it:
//   - a locale from the brief (cs, de, …) that nobody actually translated
//   - a key present but empty, or copy-pasted from English
//   - a t(`x.${y}`) call, invisible to every static check
// An app that declares i18n support and ships English strings under a `cs` flag
// is not translated, so none of those may pass. What follows is the full contract.

const LOCALES_DIR = "src/i18n/locales";
const ALLOWLIST = "src/i18n/identical-ok.json";
const PSEUDO = "pseudo";
const opts = gateOptions("i18n");
const errors = [];

// --- the declared locale set -------------------------------------------------
const configSrc = read("src/i18n/config.ts");
const parseList = (name) => {
  const m = configSrc.match(new RegExp(`export const ${name}\\s*=\\s*\\[([^\\]]*)\\]`));
  return m === null ? [] : [...m[1].matchAll(/["'`]([^"'`]+)["'`]/g)].map((x) => x[1]);
};
const declared = parseList("SUPPORTED_LOCALES");
const DEFAULT = configSrc.match(/export const DEFAULT_LOCALE\s*=\s*["'`]([^"'`]+)/)?.[1];

if (DEFAULT === undefined) errors.push("src/i18n/config.ts: DEFAULT_LOCALE not found");
if (declared.length === 0) errors.push("src/i18n/config.ts: SUPPORTED_LOCALES not found or empty");
if (DEFAULT !== undefined && !declared.includes(DEFAULT)) {
  errors.push(`DEFAULT_LOCALE "${DEFAULT}" is not in SUPPORTED_LOCALES`);
}

// The catalogues on disk must be exactly the declared set — an undeclared file is
// dead, a declared-but-absent one is a runtime fallback to English in disguise.
const onDisk = existsSync(LOCALES_DIR)
  ? readdirSync(LOCALES_DIR)
      .filter((f) => f.endsWith(".json"))
      .map((f) => f.replace(/\.json$/, ""))
  : [];
for (const l of declared) if (!onDisk.includes(l)) errors.push(`declared locale "${l}" has no ${LOCALES_DIR}/${l}.json`);
for (const l of onDisk) if (!declared.includes(l)) errors.push(`${LOCALES_DIR}/${l}.json is not in SUPPORTED_LOCALES`);

// A catalogue nobody imports is a catalogue nobody ships.
const runtime = read("src/i18n/index.ts");
for (const l of declared) {
  if (!runtime.includes(`./locales/${l}.json`)) errors.push(`src/i18n/index.ts never imports ./locales/${l}.json`);
}

// --- catalogue shape ---------------------------------------------------------
const flatten = (o, prefix = "", acc = {}) => {
  for (const [k, v] of Object.entries(o)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v !== null && typeof v === "object" && !Array.isArray(v)) flatten(v, key, acc);
    else acc[key] = v;
  }
  return acc;
};

const usable = declared.filter((l) => onDisk.includes(l));
const catalogues = Object.fromEntries(
  usable.map((l) => [l, flatten(JSON.parse(read(`${LOCALES_DIR}/${l}.json`)))]),
);

const PLURAL_SUFFIX = /_(zero|one|two|few|many|other)$/;
const baseOf = (k) => k.replace(PLURAL_SUFFIX, "");
const partition = (keys) => ({
  singular: new Set(keys.filter((k) => !PLURAL_SUFFIX.test(k))),
  pluralBases: new Set(keys.filter((k) => PLURAL_SUFFIX.test(k)).map(baseOf)),
});

// Czech needs one/few/many/other where English needs one/other: demanding the same
// key list across locales would be wrong. Plural families are compared by base key
// and validated against the categories the locale's grammar actually requires.
function categoriesFor(locale) {
  try {
    return new Intl.PluralRules(locale === PSEUDO ? DEFAULT : locale).resolvedOptions().pluralCategories;
  } catch {
    return ["one", "other"];
  }
}

// --- values ------------------------------------------------------------------
const MARKER = /^(todo|tbd|fixme|xxx|n\/a|untranslated|translate ?me|\?+|-+|_+|\.+)$/i;
const placeholders = (v) => [...String(v).matchAll(/\{\{\s*([^},\s]+)/g)].map((m) => m[1]).sort();

const allowIdentical = (() => {
  if (!existsSync(ALLOWLIST)) return {};
  const parsed = JSON.parse(read(ALLOWLIST));
  for (const [k, reason] of Object.entries(parsed)) {
    if (typeof reason !== "string" || reason.trim().length < 5) {
      errors.push(`${ALLOWLIST}: "${k}" needs a reason explaining why it is identical to ${DEFAULT}`);
    }
  }
  return parsed;
})();

if (DEFAULT !== undefined && catalogues[DEFAULT] !== undefined) {
  const base = catalogues[DEFAULT];
  const baseParts = partition(Object.keys(base));
  const usedAllowlistEntries = new Set();

  for (const key of Object.keys(allowIdentical)) {
    if (base[key] === undefined) errors.push(`${ALLOWLIST}: "${key}" is not a key in ${DEFAULT}.json`);
  }

  for (const locale of usable) {
    const cat = catalogues[locale];
    const parts = partition(Object.keys(cat));
    const where = `${locale}.json`;

    // 1. exact parity on non-plural keys
    for (const k of baseParts.singular) if (cat[k] === undefined) errors.push(`${where}: missing key "${k}"`);
    for (const k of parts.singular) if (base[k] === undefined) errors.push(`${where}: orphan key "${k}" (not in ${DEFAULT})`);

    // 2. plural families: same bases, locale-correct categories
    if (opts.requirePluralCompleteness) {
      const required = categoriesFor(locale);
      for (const b of baseParts.pluralBases) {
        for (const c of required) {
          if (cat[`${b}_${c}`] === undefined) errors.push(`${where}: plural "${b}" missing the "${c}" form required by ${locale}`);
        }
        for (const k of Object.keys(cat)) {
          if (baseOf(k) === b && PLURAL_SUFFIX.test(k) && !required.includes(k.slice(b.length + 1))) {
            errors.push(`${where}: plural "${k}" is not a category ${locale} uses (${required.join("/")})`);
          }
        }
      }
    }
    for (const b of parts.pluralBases) {
      if (!baseParts.pluralBases.has(b)) errors.push(`${where}: orphan plural family "${b}" (not in ${DEFAULT})`);
    }

    // 3. every value is a real, filled-in string
    for (const [k, v] of Object.entries(cat)) {
      if (typeof v !== "string") {
        errors.push(`${where}: "${k}" is ${JSON.stringify(v)} — every leaf must be a string`);
        continue;
      }
      if (v.trim() === "") errors.push(`${where}: "${k}" is empty — an empty translation renders as a blank UI`);
      else if (MARKER.test(v.trim())) errors.push(`${where}: "${k}" is the placeholder ${JSON.stringify(v)}, not a translation`);
    }

    // 4. interpolation parity — a dropped {{count}} silently loses data at runtime
    for (const [k, v] of Object.entries(cat)) {
      const reference = base[k] ?? base[`${baseOf(k)}_other`] ?? base[baseOf(k)];
      if (typeof reference !== "string" || typeof v !== "string") continue;
      const want = placeholders(reference);
      const got = placeholders(v);
      if (want.join("|") !== got.join("|")) {
        errors.push(`${where}: "${k}" interpolates {{${got.join(", ")}}} but ${DEFAULT} uses {{${want.join(", ")}}}`);
      }
    }

    // 5. the teeth: any locale whose value equals the default was never translated.
    // Pseudo counts too — an undecorated pseudo string means the key never went
    // through extraction, which is exactly the leak pseudo-localisation exists to find.
    if (locale !== DEFAULT && opts.requireTranslated && !opts.allowIdenticalToDefault) {
      for (const [k, v] of Object.entries(cat)) {
        if (typeof v !== "string" || base[k] !== v) continue;
        if (allowIdentical[k] !== undefined) {
          usedAllowlistEntries.add(k);
          continue;
        }
        errors.push(
          `${where}: "${k}" is byte-identical to ${DEFAULT} (${JSON.stringify(v)}) — translate it, ` +
            `or record why it cannot differ in ${ALLOWLIST}`,
        );
      }
    }
  }

  // An allowlist entry that no longer excuses anything reads as "this is fine"
  // about a key that is already translated. Keep the file honest.
  for (const k of Object.keys(allowIdentical)) {
    if (base[k] !== undefined && !usedAllowlistEntries.has(k)) {
      errors.push(`${ALLOWLIST}: "${k}" is stale — no locale leaves it identical to ${DEFAULT} any more`);
    }
  }

  // --- keys used in code ------------------------------------------------------
  const stripComments = (s) => s.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
  const used = new Set();

  for (const f of walk("src", isProd)) {
    const raw = read(f);
    // An explicit escape hatch for genuinely computed keys: the file lists every
    // key the expression can produce, and they are checked like any other.
    const dynamicDecls = [...raw.matchAll(/\/\/\s*i18n-dynamic:\s*(.+)/g)].flatMap((m) =>
      m[1].split(",").map((s) => s.trim()).filter(Boolean),
    );
    for (const k of dynamicDecls) used.add(k);

    const body = stripComments(raw);
    for (const m of body.matchAll(/i18nKey\s*=\s*["']([^"']+)["']/g)) used.add(m[1]);

    for (const m of body.matchAll(/\bt\(\s*/g)) {
      const rest = body.slice(m.index + m[0].length);
      const quote = rest[0];
      if (quote === '"' || quote === "'" || quote === "`") {
        const end = rest.indexOf(quote, 1);
        const literal = end === -1 ? "" : rest.slice(1, end);
        if (end !== -1 && !literal.includes("${")) {
          used.add(literal);
          continue;
        }
      }
      if (opts.failOnDynamicKeys && dynamicDecls.length === 0) {
        errors.push(
          `${f}: t(${rest.slice(0, 28).replace(/\s+/g, " ")}…) uses a computed key — no static check can ` +
            `prove it is translated. Declare the possible keys with "// i18n-dynamic: a.b, a.c".`,
        );
      }
    }
  }

  const knownKey = (k) => base[k] !== undefined || baseParts.pluralBases.has(k);
  for (const k of used) if (!knownKey(k)) errors.push(`used in code but missing from ${DEFAULT}.json: "${k}"`);
  if (opts.failOnOrphanKeys) {
    for (const k of baseParts.singular) if (!used.has(k)) errors.push(`${DEFAULT}.json: "${k}" is never used in code`);
    for (const b of baseParts.pluralBases) if (!used.has(b)) errors.push(`${DEFAULT}.json: plural "${b}" is never used in code`);
  }
}

const realLocales = usable.filter((l) => l !== PSEUDO);
gateResult(
  "i18n",
  `i18n:verify: ${realLocales.length} locale(s) [${realLocales.join(", ")}] fully translated, ` +
    `${Object.keys(catalogues[DEFAULT] ?? {}).length} keys, no orphans, no computed keys`,
  errors,
);

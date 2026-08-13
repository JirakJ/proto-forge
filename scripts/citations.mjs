import { existsSync } from "node:fs";
import { walk, read, readJson, withoutFences, headings, fail, ok } from "./lib.mjs";

// The gate that makes "no gaps" mechanical rather than aspirational.
//
// A normative document is only worth citing if the citation resolves, and a rule
// is only worth stating if something fails when it is broken. Six checks:
//
//   1. every BR-xx / NFR-xx / BRS §x / T<n> citation resolves to the register
//      or the decision table
//   2. every ADR citation resolves, and does not cross ADR namespaces
//   3. every rule names an enforcer
//   4. every named enforcer exists as a script in every template the rule covers
//   5. every gate is named by at least one rule  — an enforcer with no norm
//   6. every rule names a gates:selftest case, and that case is registered in
//      every in-scope template's suite (or the plugin's own)
//
// (3) and (6) close the direction people forget: a rule nobody enforces reads as
// a guarantee. (5) closes the other one: a gate no rule motivates is a gate the
// next person deletes, because nothing says why it is there.
//
// Templates come from references/templates.json — the registry every plugin gate
// loops over (ADR 007). A rule's optional `- **Scope:**` bullet names which
// templates it binds: `all`, a kind (frontend | backend), template ids, or
// `plugin` (enforced by root package.json scripts only). Absent scope = `web`,
// so the pre-registry rule corpus keeps its meaning without a rewrite. Because
// check 4 requires the enforcer in EVERY in-scope template, identical gate names
// across stacks are forced by this gate, not by convention.

const REGISTER = "references/requirements.md";
const TABLE = "references/decision-table.md";
const REGISTRY = "references/templates.json";

// Scope: prose that STATES the norm. docs/specs/** and docs/plans/** are excluded —
// an engineering record legitimately names a rule it is about to create, and failing
// on that teaches people to stop writing plans.
const SCANNED = ["SKILL.md", "README.md"];
const CODE = /\.(md|ts|tsx|mjs|js)$/;

const errors = [];
const missing = [REGISTER, TABLE, REGISTRY].filter((p) => !existsSync(p));
if (missing.length > 0) fail("citations FAILED", missing.map((p) => `${p} is missing`));

const TEMPLATES = readJson(REGISTRY).templates ?? [];
if (TEMPLATES.length === 0) fail("citations FAILED", [`${REGISTRY} lists no templates`]);
for (const t of TEMPLATES) {
  if (!existsSync(`${t.dir}/package.json`)) {
    fail("citations FAILED", [`${REGISTRY}: template "${t.id}" has no ${t.dir}/package.json`]);
  }
}
const templateIds = new Set(TEMPLATES.map((t) => t.id));

const SCANNED_TREES = ["references", ...TEMPLATES.map((t) => t.dir), "docs/adr", "skills"];

const registerSrc = read(REGISTER);

// --- what the register offers -------------------------------------------------
const registerHeadings = headings(registerSrc);
const ruleIds = new Set(
  registerHeadings.map((h) => /^(BR-\d+|NFR-\d+)\s+—/.exec(h)?.[1]).filter((v) => v !== undefined),
);
const sectionIds = new Set(
  registerHeadings.map((h) => /^§([\d.]+)\b/.exec(h)?.[1]).filter((v) => v !== undefined),
);
const tableRows = new Set([...read(TABLE).matchAll(/^\|\s*(T\d+)\s*\|/gm)].map((m) => m[1]));

// §19 records identifiers the reconstruction found uncited. A mention there is a
// statement ABOUT a citation, not a citation, so it must not demand a rule.
const notesStart = registerSrc.indexOf("## §19");
const registerBeforeNotes = notesStart === -1 ? registerSrc : registerSrc.slice(0, notesStart);

// --- what the repo cites ------------------------------------------------------
const scanned = [
  ...SCANNED.filter((p) => existsSync(p)),
  ...SCANNED_TREES.flatMap((t) => walk(t, (p) => CODE.test(p))),
];

const RULE_CITE = /\b(BR-\d+|NFR-\d+)\b/g;
const SECTION_CITE = /BRS §([\d]+(?:\.[\d]+)?)/g;
// Built as the range 1..maxRow from the register's actual ids (longest first, so T2
// never shadows T22): a bare \bT\d+\b matches type parameters, hashes and version
// strings, and a gate that cries wolf gets switched off — but a hardcoded ceiling
// has to be re-widened by hand every time the table grows, which is how T14 would
// silently go uncited. The RANGE (not just the existing ids) is what keeps the
// missing-row check alive: citing a removed T9 must still fail, not fall outside
// the regex.
function boundedCite(prefix, ids) {
  if (ids.size === 0) return null;
  const max = Math.max(...[...ids].map((v) => Number(v.slice(prefix.length))));
  const range = Array.from({ length: max }, (_, i) => String(i + 1)).sort((a, b) => b.length - a.length);
  return new RegExp(`\\b${prefix}(${range.join("|")})\\b`, "g");
}
const ROW_CITE = boundedCite("T", tableRows);

// The discovery skill's citation namespaces (ADR 008), same construction, matched
// in .md files only — a D or Q token in code is a variable, not a claim. Guarded:
// both registers ship with the discovery skill, and a repo without it (a selftest
// fixture, a stripped install) simply has no D/Q namespace to violate.
const DISCOVERY_TABLE = "skills/discovery/references/discovery-table.md";
const QUESTIONS = "skills/discovery/template/.discovery/questions.json";
const discoveryRows = existsSync(DISCOVERY_TABLE)
  ? new Set([...read(DISCOVERY_TABLE).matchAll(/^\|\s*(D\d+)\s*\|/gm)].map((m) => m[1]))
  : new Set();
const questionIds = existsSync(QUESTIONS)
  ? new Set((readJson(QUESTIONS).questions ?? []).map((q) => q.id).filter((id) => /^Q\d+$/.test(id ?? "")))
  : new Set();
const D_CITE = boundedCite("D", discoveryRows);
const Q_CITE = boundedCite("Q", questionIds);
// An explicit annotation wins over the file's default namespace, because the
// register legitimately discusses both.
const ADR_CITE = /(?:@adr\s+|\bADR[\s-])(\d{3})\b(?:\s*\((plugin|prototype) namespace\))?/g;

const adrFiles = (dir) => (existsSync(dir) ? walk(dir, (p) => p.endsWith(".md")) : []);
const adrNumbers = (dir) => new Set(adrFiles(dir).map((p) => /\/(\d+)-/.exec(p)?.[1]).filter(Boolean));
const templateAdrs = new Map(TEMPLATES.map((t) => [t.id, adrNumbers(`${t.dir}/docs/adr`)]));
const pluginAdrs = adrNumbers("docs/adr");
const anyTemplateHas = (num) => [...templateAdrs.values()].some((set) => set.has(num));

/**
 * Where a prose "ADR NNN" is a REFERENCE to a record rather than an ALLOCATION of a
 * number. SKILL.md, references/** and the gate scripts hand out numbers that do not
 * exist yet ("persistence = api -> ADR 023"), and use others as worked examples
 * ("waiver citing ADR 150"). Enforcing there would demand that every future ADR
 * already exist, so the check applies only where a citation can only mean a record:
 * the ADR trees themselves.
 */
const templateOf = (file) => TEMPLATES.find((t) => file.startsWith(`${t.dir}/`));
const citesRecords = (file) =>
  file.startsWith("docs/adr/") || TEMPLATES.some((t) => file.startsWith(`${t.dir}/docs/adr/`));

for (const file of scanned) {
  // The register's own §19 is excluded; everything else is scanned whole.
  const body = file === REGISTER ? registerBeforeNotes : read(file);
  const prose = file.endsWith(".md") ? withoutFences(body) : body;

  for (const m of prose.matchAll(RULE_CITE)) {
    if (!ruleIds.has(m[1])) errors.push(`${file}: cites ${m[1]}, which ${REGISTER} does not define`);
  }
  for (const m of prose.matchAll(SECTION_CITE)) {
    if (!sectionIds.has(m[1])) errors.push(`${file}: cites BRS §${m[1]}, which ${REGISTER} has no heading for`);
  }
  if (ROW_CITE !== null) {
    for (const m of prose.matchAll(ROW_CITE)) {
      if (!tableRows.has(m[0])) errors.push(`${file}: cites ${m[0]}, which ${TABLE} has no row for`);
    }
  }
  if (file.endsWith(".md")) {
    if (D_CITE !== null) {
      for (const m of prose.matchAll(D_CITE)) {
        if (!discoveryRows.has(m[0])) errors.push(`${file}: cites ${m[0]}, which ${DISCOVERY_TABLE} has no row for`);
      }
    }
    if (Q_CITE !== null) {
      for (const m of prose.matchAll(Q_CITE)) {
        if (!questionIds.has(m[0])) errors.push(`${file}: cites ${m[0]}, which ${QUESTIONS} does not define`);
      }
    }
  }

  // ADR namespaces, deliberately separate: each template's docs/adr describes the
  // seed a prototype starts from, the plugin's docs/adr records how the seeds
  // changed. A citation that crosses them is a category error, not a shortcut.
  // "(prototype namespace)" from plugin-side prose resolves against ANY template's
  // tree — the register legitimately speaks about the seed ADRs all templates share.
  if (!citesRecords(file)) continue;
  const inTemplate = templateOf(file);
  for (const m of prose.matchAll(ADR_CITE)) {
    const annotated = m[2];
    const wantsPlugin = annotated === "plugin" || (annotated === undefined && inTemplate === undefined);
    if (wantsPlugin) {
      if (pluginAdrs.has(m[1])) continue;
      errors.push(
        anyTemplateHas(m[1])
          ? `${file}: cites ADR ${m[1]}, which exists only in a template namespace — annotate it ` +
            `"(prototype namespace)" if that is deliberate`
          : `${file}: cites ADR ${m[1]}, which does not exist in docs/adr`,
      );
      continue;
    }
    const own = inTemplate !== undefined ? templateAdrs.get(inTemplate.id) : null;
    const resolves = own !== null ? own.has(m[1]) : anyTemplateHas(m[1]);
    if (resolves) continue;
    errors.push(
      pluginAdrs.has(m[1])
        ? `${file}: cites ADR ${m[1]}, which exists only in the plugin namespace — annotate it ` +
          `"(plugin namespace)" if that is deliberate`
        : `${file}: cites ADR ${m[1]}, which does not exist in ${inTemplate !== undefined ? `${inTemplate.dir}/docs/adr` : "any template's docs/adr"}`,
    );
  }
}

// --- rules, enforcers and their proofs ----------------------------------------
/** Splits the register's §10 into one block per rule heading. */
function ruleBlocks(src) {
  const out = new Map();
  const parts = src.split(/^### /m).slice(1);
  for (const part of parts) {
    const id = /^(BR-\d+|NFR-\d+)\s+—/.exec(part)?.[1];
    if (id !== undefined) out.set(id, part);
  }
  return out;
}

// No `m` flag: with it, the lazy body stops at the first line's `$` and every
// continuation line of a wrapped bullet silently escapes validation — an enforcer
// or a cited case on line two was invisible to checks 4-6.
const bullet = (block, label) =>
  new RegExp(`(?:^|\\n)- \\*\\*${label}:\\*\\*([\\s\\S]*?)(?=\\n- \\*\\*|\\n## |\\n### |\\n\\n|$)`).exec(block)?.[1];
const backticked = (text) => [...(text ?? "").matchAll(/`([^`]+)`/g)].map((m) => m[1]);
const SCRIPT_SHAPED = /^[a-z][a-z0-9]*(:[a-z][a-z0-9-]*)*$/;

/** Scope tokens (all | frontend | backend | <template id>) resolved to ids.
 *  Returns null when any token is unrecognized — the caller decides whether that
 *  is an error (a Scope bullet) or prose (a parenthetical after an enforcer). */
const TEMPLATE_KINDS = ["frontend", "backend", "e2e", "workspace"];

function resolveScopeTokens(tokens) {
  const ids = new Set();
  for (const token of tokens) {
    if (token === "all") for (const t of TEMPLATES) ids.add(t.id);
    else if (TEMPLATE_KINDS.includes(token)) {
      for (const t of TEMPLATES) if (t.kind === token) ids.add(t.id);
    } else if (templateIds.has(token)) ids.add(token);
    else return null;
  }
  return [...ids];
}

/** A rule's `- **Scope:**` bullet resolved to the template ids it binds.
 *  Absent = web (the pre-registry corpus keeps its meaning); `plugin` = none —
 *  the rule is enforced by root package.json scripts alone. */
function scopeTemplates(block, id) {
  const raw = bullet(block, "Scope");
  if (raw === undefined) return ["web"];
  const tokens = raw.trim().split(/\s*[,|]\s*/).map((s) => s.trim()).filter(Boolean)
    .filter((t) => t !== "plugin");
  const ids = resolveScopeTokens(tokens);
  if (ids === null) {
    errors.push(`${REGISTER}: ${id} has a scope token in "${raw.trim()}" naming no template, kind or "plugin"/"all"`);
    return [];
  }
  return ids;
}

/** A parenthetical right after an enforcer token or a proven-by case narrows it to
 *  a subset of the rule's scope: `layer:scan` (web) in an all-scoped rule demands
 *  layer:scan only in web. A parenthetical whose tokens resolve to no known
 *  scope is prose ("(the bypass that…)") and narrows nothing. */
function restrict(scope, parenthetical) {
  if (parenthetical === undefined) return scope;
  const ids = resolveScopeTokens(parenthetical.split(/\s*,\s*/).map((s) => s.trim()).filter(Boolean));
  if (ids === null) return scope;
  return scope.filter((id) => ids.includes(id));
}

const templateScripts = new Map(
  TEMPLATES.map((t) => [t.id, new Set(Object.keys(readJson(`${t.dir}/package.json`).scripts ?? {}))]),
);
const pluginScripts = new Set(existsSync("package.json") ? Object.keys(readJson("package.json").scripts ?? {}) : []);

// Cases register through expect(), hook() (its guardrail-shaped sibling), and
// inlineCase() — the marker a suite places on a proof written as an inline block
// rather than a spawned fixture (a validator exercised in-process, a tool-gated
// render). The marker is a declaration, and the block beneath it is the proof.
// Per-template suites prove prototype rules; scripts/*.selftest.mjs proves plugin rules.
const CASE_CALL = /(?:expect|hook|inlineCase)\(\s*"([^"]+)"/g;
const casesIn = (paths) =>
  new Set(paths.filter((p) => existsSync(p)).flatMap((p) => [...read(p).matchAll(CASE_CALL)].map((m) => m[1])));
const templateCases = new Map(TEMPLATES.map((t) => [t.id, casesIn([`${t.dir}/scripts/gates-selftest.mjs`])]));
const pluginCases = casesIn(walk("scripts", (p) => p.endsWith(".selftest.mjs")));

// Which scripts each template has a norm for. Section-level "Enforced by" bullets
// (§3.1 owns the coverage gate, §12.2 owns typecheck) bind EVERY template — the
// registry forces structural symmetry — while a §10 rule binds exactly its scope.
const namedPerTemplate = new Map(TEMPLATES.map((t) => [t.id, new Set()]));
const nameFor = (ids, token) => {
  for (const id of ids) namedPerTemplate.get(id)?.add(token);
};

const ruleStart = registerBeforeNotes.indexOf("## §10");
const nextSection = registerBeforeNotes.indexOf("\n## §11");
const outsideRules =
  ruleStart === -1
    ? registerBeforeNotes
    : registerBeforeNotes.slice(0, ruleStart) + (nextSection === -1 ? "" : registerBeforeNotes.slice(nextSection));
for (const m of outsideRules.matchAll(/^- \*\*Enforced by:\*\*([^\n]*(?:\n(?!- \*\*|#)[^\n]*)*)/gm)) {
  for (const token of backticked(m[1])) {
    if (SCRIPT_SHAPED.test(token)) nameFor([...templateIds], token);
  }
}

const blocks = ruleBlocks(registerBeforeNotes);
if (blocks.size === 0) errors.push(`${REGISTER}: §10 defines no rules — nothing for a gate to be accountable to`);

for (const [id, block] of blocks) {
  const scope = scopeTemplates(block, id);
  const enforced = bullet(block, "Enforced by");
  if (enforced === undefined || enforced.trim() === "") {
    errors.push(`${REGISTER}: ${id} names no enforcer — a rule nobody enforces reads as a guarantee`);
  } else {
    for (const m of enforced.matchAll(/`([^`]+)`(?:\s*\(([^)]+)\))?/g)) {
      const token = m[1];
      if (!SCRIPT_SHAPED.test(token)) continue; // prose enforcers (a hook path, "ADR review")
      if (pluginScripts.has(token)) {
        // A plugin-level gate may enforce a rule of any scope (citations itself does).
        continue;
      }
      const effective = restrict(scope, m[2]);
      const missingIn = effective.filter((tid) => !templateScripts.get(tid)?.has(token));
      if (missingIn.length > 0) {
        errors.push(
          `${REGISTER}: ${id} is enforced by \`${token}\`, which is not a script in ` +
            missingIn.map((tid) => `${tid}'s package.json`).join(", "),
        );
      }
      nameFor(effective, token);
    }
  }

  const proven = bullet(block, "Proven by");
  if (proven === undefined || proven.trim() === "") {
    errors.push(`${REGISTER}: ${id} has no selftest case — nobody has seen its gate fail`);
  }
  for (const m of (proven ?? "").matchAll(/"([^"]+)"(?:\s*\(([^)]+)\))?/g)) {
    // Prose wraps; registered names never do. Collapse the wrap before comparing.
    const name = m[1].replace(/\s+/g, " ");
    if (pluginCases.has(name)) continue;
    const effective = restrict(scope, m[2]);
    const missingIn = effective.filter((tid) => !templateCases.get(tid)?.has(name));
    if (missingIn.length > 0) {
      errors.push(
        `${REGISTER}: ${id} cites the selftest case "${name}", which ` +
          missingIn.map((tid) => `${tid}'s gates-selftest`).join(", ") +
          ` never registers`,
      );
    }
  }
}

for (const t of TEMPLATES) {
  const notAGate = new Set(t.notAGate ?? []);
  const named = namedPerTemplate.get(t.id);
  for (const script of templateScripts.get(t.id)) {
    if (notAGate.has(script) || named.has(script)) continue;
    errors.push(
      `${t.dir}/package.json: "${script}" is a gate no rule names — add the rule to ${REGISTER} §10 ` +
        `(with a Scope covering "${t.id}"), or add the script to the template's notAGate in ${REGISTRY} ` +
        `if it does not enforce anything`,
    );
  }
}

if (errors.length > 0) fail("citations FAILED", errors);
ok(
  `citations: ${scanned.length} files, ${ruleIds.size} rules, ${sectionIds.size} sections, ` +
    `${tableRows.size} table rows, ${discoveryRows.size} discovery rows, ${questionIds.size} questions, ` +
    `${TEMPLATES.length} template(s) — every citation resolves, every rule is enforced, every gate is motivated`,
);

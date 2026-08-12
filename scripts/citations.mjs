import { existsSync } from "node:fs";
import { walk, read, readJson, withoutFences, headings, fail, ok } from "./lib.mjs";

// The gate that makes "no gaps" mechanical rather than aspirational.
//
// A normative document is only worth citing if the citation resolves, and a rule
// is only worth stating if something fails when it is broken. Six checks:
//
//   1. every BR-xx / NFR-xx / BRS §x / T<n> citation resolves to the register
//      or the decision table
//   2. every ADR citation resolves, and does not cross the two ADR namespaces
//   3. every rule names an enforcer
//   4. every named enforcer exists as a script
//   5. every gate is named by at least one rule  — an enforcer with no norm
//   6. every rule names a gates:selftest case, and that case is registered
//
// (3) and (6) close the direction people forget: a rule nobody enforces reads as
// a guarantee. (5) closes the other one: a gate no rule motivates is a gate the
// next person deletes, because nothing says why it is there.

const REGISTER = "references/requirements.md";
const TABLE = "references/decision-table.md";
const TEMPLATE_PKG = "template/package.json";
const TEMPLATE_SELFTEST = "template/scripts/gates-selftest.mjs";

// Scope: prose that STATES the norm. docs/specs/** and docs/plans/** are excluded —
// an engineering record legitimately names a rule it is about to create, and failing
// on that teaches people to stop writing plans.
const SCANNED = ["SKILL.md", "README.md"];
const SCANNED_TREES = ["references", "template", "docs/adr"];
const CODE = /\.(md|ts|tsx|mjs|js)$/;

// Scripts that are not gates: they build, serve, generate or send. Each needs no
// rule behind it, and listing them here is cheaper than a rule that says "vite builds".
const NOT_A_GATE = new Set([
  "dev", "build", "preview", "verify", "prepare",
  "i18n:extract", "docs:shots", "config:show", "snapshot", "seed:lock", "sbom",
  "sync:jira", "sync:confluence", "sync:pull", "sync:status",
  "test:e2e",
]);

const errors = [];
const missing = [REGISTER, TABLE, TEMPLATE_PKG].filter((p) => !existsSync(p));
if (missing.length > 0) fail("citations FAILED", missing.map((p) => `${p} is missing`));

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
// Restricted to the table's real range: a bare \bT\d+\b matches type parameters,
// hashes and version strings, and a gate that cries wolf gets switched off.
const ROW_CITE = /\bT([1-9]|1[0-3])\b/g;
// An explicit annotation wins over the file's default namespace, because the
// register legitimately discusses both.
const ADR_CITE = /(?:@adr\s+|\bADR[\s-])(\d{3})\b(?:\s*\((plugin|prototype) namespace\))?/g;

const adrFiles = (dir) => (existsSync(dir) ? walk(dir, (p) => p.endsWith(".md")) : []);
const adrNumbers = (dir) => new Set(adrFiles(dir).map((p) => /\/(\d+)-/.exec(p)?.[1]).filter(Boolean));
const templateAdrs = adrNumbers("template/docs/adr");
const pluginAdrs = adrNumbers("docs/adr");

/**
 * Where a prose "ADR NNN" is a REFERENCE to a record rather than an ALLOCATION of a
 * number. SKILL.md, references/** and the gate scripts hand out numbers that do not
 * exist yet ("persistence = api -> ADR 023"), and use others as worked examples
 * ("waiver citing ADR 150"). Enforcing there would demand that every future ADR
 * already exist, so the check applies only where a citation can only mean a record:
 * the two ADR trees themselves.
 */
const citesRecords = (file) => file.startsWith("docs/adr/") || file.startsWith("template/docs/adr/");

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
  for (const m of prose.matchAll(ROW_CITE)) {
    if (!tableRows.has(m[0])) errors.push(`${file}: cites ${m[0]}, which ${TABLE} has no row for`);
  }

  // Two ADR namespaces, deliberately separate: template/docs/adr describes the
  // seed a prototype starts from, docs/adr records how the seed changed. A
  // citation that crosses them is a category error, not a shortcut.
  if (!citesRecords(file)) continue;
  const inTemplate = file.startsWith("template/");
  for (const m of prose.matchAll(ADR_CITE)) {
    const annotated = m[2];
    const wantsPlugin = annotated === "plugin" || (annotated === undefined && !inTemplate);
    const own = wantsPlugin ? pluginAdrs : templateAdrs;
    const other = wantsPlugin ? templateAdrs : pluginAdrs;
    const ownDir = wantsPlugin ? "docs/adr" : "template/docs/adr";
    if (own.has(m[1])) continue;
    errors.push(
      other.has(m[1])
        ? `${file}: cites ADR ${m[1]}, which exists only in the other ADR namespace — annotate it ` +
          `"(plugin namespace)" / "(prototype namespace)" if that is deliberate`
        : `${file}: cites ADR ${m[1]}, which does not exist in ${ownDir}`,
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

const bullet = (block, label) => new RegExp(`^- \\*\\*${label}:\\*\\*([\\s\\S]*?)(?=\\n- \\*\\*|\\n## |\\n### |$)`, "m").exec(block)?.[1];
const backticked = (text) => [...(text ?? "").matchAll(/`([^`]+)`/g)].map((m) => m[1]);
const SCRIPT_SHAPED = /^[a-z][a-z0-9]*(:[a-z][a-z0-9-]*)*$/;

const templateScripts = new Set(Object.keys(readJson(TEMPLATE_PKG).scripts ?? {}));
const pluginScripts = new Set(existsSync("package.json") ? Object.keys(readJson("package.json").scripts ?? {}) : []);
// Cases register through expect() and through hook(), its guardrail-shaped sibling.
// Both scopes count: the register covers prototype rules, proven in the template's
// suite, and plugin rules, proven in scripts/*.selftest.mjs.
const CASE_CALL = /(?:expect|hook)\(\s*"([^"]+)"/g;
const caseSources = [
  ...(existsSync(TEMPLATE_SELFTEST) ? [TEMPLATE_SELFTEST] : []),
  ...walk("scripts", (p) => p.endsWith(".selftest.mjs")),
];
const registeredCases = new Set(caseSources.flatMap((p) => [...read(p).matchAll(CASE_CALL)].map((m) => m[1])));

// Enforcers are named by rules in §10 AND by the normative sections (§3.1 owns the
// coverage gate, §12.2 owns typecheck). Collecting from both is what lets check 5
// hold without inventing a BR-xx for every section that already states a rule.
const named = new Set();
for (const m of registerBeforeNotes.matchAll(/^- \*\*Enforced by:\*\*([^\n]*(?:\n(?!- \*\*|#)[^\n]*)*)/gm)) {
  for (const token of backticked(m[1])) if (SCRIPT_SHAPED.test(token)) named.add(token);
}

const blocks = ruleBlocks(registerBeforeNotes);
if (blocks.size === 0) errors.push(`${REGISTER}: §10 defines no rules — nothing for a gate to be accountable to`);

for (const [id, block] of blocks) {
  const enforced = bullet(block, "Enforced by");
  if (enforced === undefined || enforced.trim() === "") {
    errors.push(`${REGISTER}: ${id} names no enforcer — a rule nobody enforces reads as a guarantee`);
  } else {
    for (const token of backticked(enforced)) {
      if (!SCRIPT_SHAPED.test(token)) continue; // prose enforcers (a hook path, "ADR review")
      if (templateScripts.has(token) || pluginScripts.has(token)) {
        named.add(token);
        continue;
      }
      errors.push(`${REGISTER}: ${id} is enforced by \`${token}\`, which is not a gate in ${TEMPLATE_PKG}`);
    }
  }

  const proven = bullet(block, "Proven by");
  const cited = [...(proven ?? "").matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  if (proven === undefined || proven.trim() === "") {
    errors.push(`${REGISTER}: ${id} has no selftest case — nobody has seen its gate fail`);
  }
  for (const name of cited) {
    if (!registeredCases.has(name)) {
      errors.push(`${REGISTER}: ${id} cites the selftest case "${name}", which ${TEMPLATE_SELFTEST} never registers`);
    }
  }
}

for (const script of templateScripts) {
  if (NOT_A_GATE.has(script) || named.has(script)) continue;
  errors.push(
    `${TEMPLATE_PKG}: "${script}" is a gate no rule names — add the rule to ${REGISTER} §10, ` +
      `or add the script to NOT_A_GATE with a reason if it does not enforce anything`,
  );
}

if (errors.length > 0) fail("citations FAILED", errors);
ok(
  `citations: ${scanned.length} files, ${ruleIds.size} rules, ${sectionIds.size} sections, ` +
    `${tableRows.size} table rows — every citation resolves, every rule is enforced, every gate is motivated`,
);

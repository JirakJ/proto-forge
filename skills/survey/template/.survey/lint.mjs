import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

// The survey gate. It holds the properties prose cannot hold about itself: that
// every area has a document and every document an area, that no row states a
// claim without the evidence and the confidence that make it checkable, and that
// every unknown points at a question the discovery taxonomy actually defines.
//
// It is deliberately small and dependency-free — the same doctrine as the
// templates' gate corpus. A gate nobody can read is a gate nobody maintains.
//
//   node .survey/lint.mjs <survey-dir>

const dir = process.argv[2];
if (dir === undefined) {
  process.stderr.write("usage: node .survey/lint.mjs <survey-dir>\n");
  process.exit(2);
}

const errors = [];
const read = (p) => readFileSync(p, "utf8");
const CONFIDENCE = new Set(["observed", "inferred"]);
const EVIDENCE = /^[^\s:]+:\d+$/;

const bridgePath = join(dir, "survey.json");
if (!existsSync(bridgePath)) {
  process.stderr.write(`✗ survey-lint: ${bridgePath} is missing — the bridge IS the survey (S8)\n`);
  process.exit(1);
}

let bridge;
try {
  bridge = JSON.parse(read(bridgePath));
} catch (e) {
  process.stderr.write(`✗ survey-lint: ${bridgePath} is not parseable JSON — ${e.message}\n`);
  process.exit(1);
}

// The question surface belongs to the discovery skill (S5). This lint knows the
// SHAPE of a question id, not the catalogue: hardcoding a second copy of the
// taxonomy here is exactly the drift the hand-off exists to avoid.
const QUESTION = /^Q([1-9]|1\d|2[0-4])$/;

const areas = bridge.areas ?? [];
const capabilities = bridge.capabilities ?? [];
const unknowns = bridge.unknowns ?? [];
const areaIds = new Set(areas.map((a) => a.id));

if (areas.length === 0) errors.push("survey.json declares no areas — an empty survey is a run that did not happen");
if (typeof bridge.commit !== "string" || bridge.commit.length < 7) {
  errors.push("survey.json carries no commit — a survey that cannot name what it read is a survey of nothing in particular (S0)");
}
if ((bridge.sources ?? []).length === 0) errors.push("survey.json pins no sources — every claim must trace to a file (S3)");
for (const source of bridge.sources ?? []) {
  if (!/^[0-9a-f]{64}$/.test(source.sha256 ?? "")) {
    errors.push(`survey.json source "${source.path}" has no sha256 — a pin that is not a hash is not a pin`);
  }
}

// --- areas ⇔ documents, both ways --------------------------------------------
for (const area of areas) {
  const doc = join(dir, area.doc ?? "");
  if (!area.doc || !existsSync(doc)) {
    errors.push(`area "${area.id}" names document "${area.doc}", which does not exist`);
    continue;
  }
  const body = read(doc);
  for (const heading of ["## Capabilities", "## Unknowns", "## Coverage"]) {
    if (!body.includes(heading)) errors.push(`${area.doc}: missing the pinned "${heading}" section (S4)`);
  }
  if (!new RegExp(`^area:\\s*${area.id}\\s*$`, "m").test(body)) {
    errors.push(`${area.doc}: frontmatter area does not name "${area.id}"`);
  }
}

const docDir = join(dir, "docs");
if (existsSync(docDir)) {
  const documented = new Set(areas.map((a) => a.doc));
  for (const entry of readdirSync(docDir)) {
    const doc = join("docs", entry, "README.md");
    if (existsSync(join(dir, doc)) && !documented.has(doc)) {
      errors.push(`${doc} exists but no area in survey.json names it — an orphan document is a claim nothing keeps current`);
    }
  }
}

// --- every row is checkable ---------------------------------------------------
for (const row of capabilities) {
  const at = `capability ${row.area}/${row.id}`;
  if (!areaIds.has(row.area)) errors.push(`${at}: names an area survey.json does not declare`);
  if (!EVIDENCE.test(row.evidence ?? "")) {
    errors.push(`${at}: evidence "${row.evidence}" is not path:line — a capability nobody can point at is a belief (S3)`);
  }
  if (!CONFIDENCE.has(row.confidence)) {
    errors.push(`${at}: confidence "${row.confidence}" must be observed|inferred — an unlabelled row launders a guess into a fact (S6)`);
  }
}

for (const row of unknowns) {
  const at = `unknown ${row.area}/${row.id}`;
  if (!areaIds.has(row.area)) errors.push(`${at}: names an area survey.json does not declare`);
  if (!row.topic || !row.evidence) errors.push(`${at}: an unknown states its topic AND the evidence of absence (S5)`);
  if (row.q !== null && row.q !== undefined && !QUESTION.test(row.q)) {
    errors.push(`${at}: q "${row.q}" is not a discovery question id (Q1-Q24) or null (S5)`);
  }
}

// --- the counts in areas[] are derived, not typed -----------------------------
for (const area of areas) {
  const caps = capabilities.filter((c) => c.area === area.id).length;
  const unk = unknowns.filter((u) => u.area === area.id).length;
  if (area.capabilities !== caps) errors.push(`area "${area.id}": capabilities says ${area.capabilities}, the rows count ${caps}`);
  if (area.unknowns !== unk) errors.push(`area "${area.id}": unknowns says ${area.unknowns}, the rows count ${unk}`);
}

// --- coverage is stated, never implied ----------------------------------------
if ((bridge.skipped ?? []).length === 0) {
  errors.push('survey.json records nothing under "skipped" — "nothing was found in X" and "X was not looked at" are different sentences (S7)');
}
for (const skip of bridge.skipped ?? []) {
  if (!skip.reason) errors.push(`skipped "${skip.path}" states no reason — a silent skip is undeclared coverage (S7)`);
}

if (errors.length > 0) {
  process.stderr.write(`✗ survey-lint FAILED (${errors.length})\n`);
  for (const e of errors) process.stderr.write(`    ${e}\n`);
  process.exit(1);
}

process.stdout.write(
  `✓ survey-lint: ${areas.length} area(s), ${capabilities.length} capability row(s), ` +
    `${unknowns.length} unknown(s) — every row cites evidence, states confidence and points at a real question\n`,
);

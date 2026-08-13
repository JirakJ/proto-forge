import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

// The discovery gate (D6) — one implementation, two call sites: the plugin's
// `discovery:lint` runs it over the shipped sample so the template proves itself,
// and every discovery run copies this file and runs it over its own output. It is
// therefore DEPENDENCY-FREE and STANDALONE: the output conventions below are
// copied from the plugin's scripts/lib.mjs deliberately, not imported, because at
// runtime the plugin tree does not exist next to the output.
//
// What it holds the output to (BRS §22):
//   BR-30  every gap row names its element, cites its evidence, states its default
//   BR-31  testid reservations obey the grammar and are unique across the run
//   BR-32  every document pins its sources; every image matches its images.lock
//   BR-33  discovery.json is a derivation of the documents and never disagrees
//
// Deterministic: reads bytes, never the clock. capturedAt in images.lock is
// provenance the lint carries but never judges.

// --- output conventions (copied from scripts/lib.mjs: stdout results, stderr failures)
function fail(msg, lines = []) {
  process.stderr.write(`✗ ${msg}\n`);
  for (const l of lines) process.stderr.write(`    ${l}\n`);
  process.exit(1);
}
function ok(msg) {
  process.stdout.write(`✓ ${msg}\n`);
}

const target = process.argv[2];
if (target === undefined || target === "") {
  fail("discovery-lint FAILED", ["usage: node lint.mjs <discovery-dir>"]);
}

const at = (...p) => join(target, ...p);
const read = (p) => readFileSync(p, "utf8");
const readJson = (p) => JSON.parse(readFileSync(p, "utf8"));
const sha256 = (p) => createHash("sha256").update(readFileSync(p)).digest("hex");
const TESTID = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const KINDS = new Set(["screen", "feature", "api-area"]);
const blank = (s) => s === "" || s === "—" || s === "-";

const errors = [];

for (const required of ["inventory.json", "discovery.json", ".discovery/questions.json", "docs"]) {
  if (!existsSync(at(required))) fail("discovery-lint FAILED", [`${target}/${required} is missing`]);
}

const questionIds = new Set((readJson(at(".discovery/questions.json")).questions ?? []).map((q) => q.id));
if (questionIds.size === 0) fail("discovery-lint FAILED", [".discovery/questions.json defines no questions"]);

// --- tiny parsers (no YAML/markdown dependency, by design) ------------------------

const unquote = (s) => {
  const t = s.trim();
  return /^".*"$/.test(t) ? t.slice(1, -1) : t;
};

/** Frontmatter: flat `key: value` lines plus one `sources:` list of `- key: value` objects. */
function parseFrontmatter(src) {
  const m = /^---\n([\s\S]*?)\n---\n?/.exec(src);
  if (m === null) return null;
  const meta = { sources: [] };
  let inSources = false;
  let current = null;
  for (const line of m[1].split("\n")) {
    if (/^\S/.test(line)) {
      inSources = false;
      current = null;
      const kv = /^([A-Za-z][A-Za-z0-9]*):\s*(.*)$/.exec(line);
      if (kv === null) continue;
      if (kv[1] === "sources") inSources = true;
      else meta[kv[1]] = unquote(kv[2]);
    } else if (inSources) {
      const item = /^\s*-\s+([A-Za-z][A-Za-z0-9]*):\s*(.*)$/.exec(line);
      const cont = /^\s+([A-Za-z][A-Za-z0-9]*):\s*(.*)$/.exec(line);
      if (item !== null) {
        current = { [item[1]]: unquote(item[2]) };
        meta.sources.push(current);
      } else if (cont !== null && current !== null) {
        current[cont[1]] = unquote(cont[2]);
      }
    }
  }
  return meta;
}

/** Markdown with fenced code blanked, so an example inside a fence is never structure. */
function withoutFences(markdown) {
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

/** The lines of a section: after the exact heading line, up to the next heading of the same or higher level. */
function sectionLines(lines, heading) {
  const start = lines.findIndex((l) => l.trim() === heading);
  if (start === -1) return null;
  const out = [];
  for (let i = start + 1; i < lines.length; i += 1) {
    if (/^#{1,2}\s/.test(lines[i])) break;
    out.push(lines[i]);
  }
  return out;
}

/** A pipe table under a section: { header, rows: string[][] } or null. */
function parseTable(lines) {
  const pipeRows = lines.filter((l) => l.trim().startsWith("|"));
  if (pipeRows.length < 2) return null;
  const cells = (line) =>
    line
      .trim()
      .replace(/^\|/, "")
      .replace(/\|$/, "")
      .split("|")
      .map((c) => c.trim());
  return { header: pipeRows[0].trim(), rows: pipeRows.slice(2).map(cells) };
}

// --- source pins (BR-32) ----------------------------------------------------------

const SOURCE_PINS = {
  figma: ["fileKey", "nodeId", "fileVersion"],
  brief: ["path", "sha256"],
  confluence: ["pageId", "version", "url"],
};

function checkSources(sources, where) {
  if (!Array.isArray(sources) || sources.length === 0) {
    errors.push(`${where}: sources is empty — a document that pins nothing cannot be trusted (BR-32)`);
    return;
  }
  sources.forEach((s, i) => {
    const pins = SOURCE_PINS[s.type];
    if (pins === undefined) {
      errors.push(`${where}: source #${i + 1} has unknown type "${s.type}" (figma | brief | confluence)`);
      return;
    }
    for (const pin of pins) {
      if (typeof s[pin] !== "string" || s[pin].trim() === "") {
        errors.push(`${where}: ${s.type} source #${i + 1} is missing its ${pin} pin (BR-32)`);
      }
    }
    if (s.type === "brief" && typeof s.sha256 === "string" && !/^[a-f0-9]{64}$/.test(s.sha256)) {
      errors.push(`${where}: brief source #${i + 1} sha256 is not a 64-hex digest (BR-32)`);
    }
  });
}

// --- inventory --------------------------------------------------------------------

const inventory = readJson(at("inventory.json"));
if (inventory.version !== 1) errors.push("inventory.json: version must be 1");
const inventoryUnits = Array.isArray(inventory.units) ? inventory.units : [];
if (inventoryUnits.length === 0) errors.push("inventory.json: units[] is empty — nothing was derived (D1)");
const inventoryIds = new Set();
for (const u of inventoryUnits) {
  const where = `inventory.json unit "${u.id ?? "?"}"`;
  if (typeof u.id !== "string" || !TESTID.test(u.id)) errors.push(`${where}: id is not lowercase kebab-case`);
  if (!KINDS.has(u.kind)) errors.push(`${where}: kind "${u.kind}" is not screen|feature|api-area`);
  if (!Number.isInteger(u.order)) errors.push(`${where}: order is not an integer`);
  if (inventoryIds.has(u.id)) errors.push(`${where}: duplicate unit id`);
  inventoryIds.add(u.id);
  checkSources(u.sources, where);
}

// --- the documents ----------------------------------------------------------------

const HEADINGS = [
  "## Situation",
  "## Problem",
  "## Implication",
  "## Need-payoff",
  "## DAPA",
  "### Definition",
  "### Acceptance criteria",
  "### Prerequisites",
  "### Assumptions",
  "## Elements",
  "## Gap table",
];
const ELEMENTS_HEADER = "| Element | Testid | Figma node | Image | Notes |";
const GAP_HEADER = "| # | Q | Element | Question | Evidence | Proposed default | Answer | Status |";
const IMAGE_REF = /!\[[^\]]*\]\(([^)]+)\)/;
const NO_IMAGE = /<!--\s*no-image:\s*(.*?)\s*-->/;

const docDirs = readdirSync(at("docs"), { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => e.name)
  .sort();

const seenTestids = new Map(); // testid -> doc that claimed it
const perUnit = new Map(); // unit id -> { kind, status, gapsOpen, gapsTotal, testids[], gaps[] }

for (const dir of docDirs) {
  const doc = `docs/${dir}/README.md`;
  if (!existsSync(at(doc))) {
    errors.push(`docs/${dir} has no README.md — every unit directory is a document`);
    continue;
  }
  if (!inventoryIds.has(dir)) errors.push(`${doc}: no inventory.json unit is named "${dir}"`);
  const src = read(at(doc));

  // 1. frontmatter completeness, incl. per-source-type pins
  const meta = parseFrontmatter(src);
  if (meta === null) {
    errors.push(`${doc}: has no --- frontmatter block`);
    continue;
  }
  if (meta.id !== dir) errors.push(`${doc}: frontmatter id "${meta.id}" disagrees with its directory "${dir}"`);
  if (!KINDS.has(meta.kind)) errors.push(`${doc}: frontmatter kind "${meta.kind}" is not screen|feature|api-area`);
  if (meta.status !== "open" && meta.status !== "answered") {
    errors.push(`${doc}: frontmatter status "${meta.status}" is not open|answered`);
  }
  for (const field of ["gapsOpen", "gapsTotal"]) {
    if (!/^\d+$/.test(meta[field] ?? "")) errors.push(`${doc}: frontmatter has no integer ${field}`);
  }
  checkSources(meta.sources, doc);

  // 3. the exact section skeleton, once each, in order
  const body = withoutFences(src.replace(/^---\n[\s\S]*?\n---\n?/, ""));
  const lines = body.split("\n");
  let lastIndex = -1;
  for (const heading of HEADINGS) {
    const hits = lines.map((l, i) => (l.trim() === heading ? i : -1)).filter((i) => i !== -1);
    if (hits.length === 0) errors.push(`${doc}: missing required section "${heading}"`);
    else if (hits.length > 1) errors.push(`${doc}: section "${heading}" appears ${hits.length} times`);
    else if (hits[0] < lastIndex) errors.push(`${doc}: section "${heading}" is out of order`);
    if (hits.length > 0) lastIndex = Math.max(lastIndex, hits[0]);
  }

  // 5 + 6. the Elements table: testids, images, reasons
  const unitTestids = [];
  const elementRows = [];
  const elementsTable = parseTable(sectionLines(lines, "## Elements") ?? []);
  if (elementsTable === null) {
    errors.push(`${doc}: the Elements section has no table`);
  } else if (elementsTable.header !== ELEMENTS_HEADER) {
    errors.push(`${doc}: Elements table header must be exactly "${ELEMENTS_HEADER}"`);
  } else {
    elementsTable.rows.forEach((cells, i) => {
      const n = i + 1;
      if (cells.length !== 5) {
        errors.push(`${doc}: Elements row ${n} has ${cells.length} cells — the table has 5 columns`);
        return;
      }
      const [element, testid, node, image] = cells;
      if (blank(element)) errors.push(`${doc}: Elements row ${n} names no element`);
      if (blank(testid)) {
        errors.push(`${doc}: Elements row ${n} reserves no testid`);
      } else if (!TESTID.test(testid)) {
        errors.push(`${doc}: testid "${testid}" — reservations use lowercase kebab-case (BR-31)`);
      } else {
        const prior = seenTestids.get(testid);
        if (prior !== undefined) {
          errors.push(`testid "${testid}" is defined in both ${prior} and ${doc} — reservations are unique across the run (BR-31)`);
        }
        seenTestids.set(testid, doc);
        unitTestids.push(testid);
        elementRows.push({ testid, node: blank(node) ? undefined : node });
      }

      const ref = IMAGE_REF.exec(image);
      if (ref !== null) {
        checkImage(doc, dir, ref[1]);
      } else if (image.startsWith("—") || image.startsWith("-")) {
        const reason = NO_IMAGE.exec(image);
        if (reason === null) {
          errors.push(`${doc}: Elements row ${n} has no image and no stated reason — use <!-- no-image: reason --> (BR-32)`);
        } else if (reason[1].length < 10) {
          errors.push(`${doc}: Elements row ${n} no-image reason "${reason[1]}" is too thin — state why (>=10 chars)`);
        }
      } else {
        errors.push(`${doc}: Elements row ${n} Image cell is neither an image nor a reasoned "—"`);
      }
    });
  }

  // 4 + 7. the gap table: shape, resolution, evidence, defaults, answers
  const gapRows = [];
  const gapTable = parseTable(sectionLines(lines, "## Gap table") ?? []);
  if (gapTable === null) {
    errors.push(`${doc}: the Gap table section has no table`);
  } else if (gapTable.header !== GAP_HEADER) {
    errors.push(`${doc}: gap table header must be exactly "${GAP_HEADER}"`);
  } else {
    gapTable.rows.forEach((cells, i) => {
      const n = i + 1;
      if (cells.length !== 8) {
        errors.push(`${doc}: gap row ${n} has ${cells.length} cells — the gap table has 8 columns`);
        return;
      }
      const [, q, element, question, evidence, proposedDefault, answer, status] = cells;
      if (!questionIds.has(q)) errors.push(`${doc}: gap row ${n} cites ${q}, which .discovery/questions.json does not define`);
      if (blank(element) || !unitTestids.includes(element)) {
        errors.push(`${doc}: gap row ${n} names element "${element}", which the Elements table does not list (BR-30)`);
      }
      if (blank(question)) errors.push(`${doc}: gap row ${n} asks nothing — the Question cell is empty`);
      if (blank(evidence)) errors.push(`${doc}: gap row ${n} has empty Evidence — a classification citing no evidence is a guess (BR-30)`);
      if (blank(proposedDefault)) errors.push(`${doc}: gap row ${n} has an empty Proposed default — a gap must state what will be assumed (BR-30)`);
      if (status !== "open" && status !== "answered") {
        errors.push(`${doc}: gap row ${n} status "${status}" is not open|answered`);
      } else if (status === "answered" && blank(answer)) {
        errors.push(`${doc}: gap row ${n} is marked answered but its Answer cell is empty`);
      } else if (status === "open" && !blank(answer)) {
        errors.push(`${doc}: gap row ${n} carries an answer but is marked open`);
      }
      gapRows.push({ q, status, proposedDefault, answer: blank(answer) ? null : answer });
    });
  }

  // 2 + 7. recomputed counts and the status biconditional
  const open = gapRows.filter((g) => g.status === "open").length;
  if (/^\d+$/.test(meta.gapsOpen ?? "") && Number(meta.gapsOpen) !== open) {
    errors.push(`${doc}: frontmatter gapsOpen is ${meta.gapsOpen}, but ${open} gap row(s) are open`);
  }
  if (/^\d+$/.test(meta.gapsTotal ?? "") && Number(meta.gapsTotal) !== gapRows.length) {
    errors.push(`${doc}: frontmatter gapsTotal is ${meta.gapsTotal}, but the gap table has ${gapRows.length} row(s)`);
  }
  if (meta.status === "answered" && open > 0) {
    errors.push(`${doc}: status is "answered" but ${open} gap row(s) are still open`);
  }
  if (meta.status === "open" && open === 0) {
    errors.push(`${doc}: status is "open" but every gap row is answered — flip the status (D9)`);
  }

  perUnit.set(dir, { kind: meta.kind, status: meta.status, gapsOpen: open, gapsTotal: gapRows.length, elementRows, gapRows });
}

// 6. images: referenced ⇒ on disk with a matching lock entry; disk ⇔ lock parity
function checkImage(doc, dir, ref) {
  const file = at("docs", dir, ref);
  if (!existsSync(file)) {
    errors.push(`${doc}: references ${ref}, which is not on disk`);
    return;
  }
  const lockPath = at("docs", dir, "images.lock");
  if (!existsSync(lockPath)) {
    errors.push(`${doc}: references ${ref} but docs/${dir}/images.lock does not exist (BR-32)`);
    return;
  }
  const entry = readJson(lockPath)[ref];
  if (entry === undefined) {
    errors.push(`${doc}: images.lock has no entry for "${ref}" (BR-32)`);
  } else if (entry.sha256 !== sha256(file)) {
    errors.push(`${doc}: "${ref}" sha256 disagrees with images.lock — the committed picture is not the captured one (BR-32)`);
  }
}

for (const dir of docDirs) {
  const lockPath = at("docs", dir, "images.lock");
  const lock = existsSync(lockPath) ? readJson(lockPath) : {};
  for (const ref of Object.keys(lock)) {
    if (!existsSync(at("docs", dir, ref))) {
      errors.push(`docs/${dir}/images.lock entry "${ref}" points at a file that is not on disk`);
    }
  }
  const imagesDir = at("docs", dir, "images");
  if (existsSync(imagesDir)) {
    for (const f of readdirSync(imagesDir)) {
      if (lock[`images/${f}`] === undefined) {
        errors.push(`docs/${dir}/images/${f} is on disk but images.lock has no entry for it (BR-32)`);
      }
    }
  }
}

for (const id of inventoryIds) {
  if (!docDirs.includes(id)) errors.push(`inventory.json lists unit "${id}" but docs/${id}/README.md does not exist`);
}

// 8. the bridge is a derivation of the documents (BR-33)
const bridge = readJson(at("discovery.json"));
if (bridge.version !== 1) errors.push("discovery.json: version must be 1");
const inventoryHash = createHash("sha256").update(readFileSync(at("inventory.json"))).digest("hex");
if (bridge.discoveryHash !== inventoryHash) {
  errors.push(`discovery.json: discoveryHash disagrees with sha256(inventory.json) — the bridge was not regenerated (BR-33)`);
}
if (typeof bridge.facets !== "object" || bridge.facets === null || Array.isArray(bridge.facets)) {
  errors.push("discovery.json: facets must be an object (a partial facets prefill, possibly empty)");
}

const orderedUnits = [...inventoryUnits].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).filter((u) => perUnit.has(u.id));
const expect = {
  units: orderedUnits.map((u) => {
    const d = perUnit.get(u.id);
    return [u.id, d.kind, `docs/${u.id}/README.md`, d.status, d.gapsOpen, d.gapsTotal];
  }),
  testids: orderedUnits.flatMap((u) => perUnit.get(u.id).elementRows.map((e) => [u.id, e.testid, e.node ?? null])),
  gaps: orderedUnits.flatMap((u) => perUnit.get(u.id).gapRows.map((g) => [u.id, g.q, g.status, g.proposedDefault, g.answer])),
};
const got = {
  units: (bridge.units ?? []).map((u) => [u.id, u.kind, u.doc, u.status, u.gapsOpen, u.gapsTotal]),
  testids: (bridge.testids ?? []).map((t) => [t.unit, t.testid, t.figmaNodeId ?? null]),
  gaps: (bridge.gaps ?? []).map((g) => [g.unit, g.q, g.status, g.proposedDefault, g.answer ?? null]),
};
for (const key of ["units", "testids", "gaps"]) {
  const want = expect[key].map((r) => JSON.stringify(r));
  const have = got[key].map((r) => JSON.stringify(r));
  if (want.length !== have.length) {
    errors.push(`discovery.json: ${key}[] has ${have.length} entries, the documents yield ${want.length} — regenerate the bridge (BR-33)`);
    continue;
  }
  want.forEach((row, i) => {
    if (row !== have[i]) {
      errors.push(`discovery.json: ${key}[${i}] disagrees with the documents — expected ${row}, got ${have[i]} (BR-33)`);
    }
  });
}

if (errors.length > 0) fail("discovery-lint FAILED", errors);
ok(
  `discovery-lint: ${docDirs.length} unit(s), ${seenTestids.size} reserved testid(s), ` +
    `${[...perUnit.values()].reduce((n, d) => n + d.gapsTotal, 0)} gap row(s) — documents, images and bridge agree`,
);

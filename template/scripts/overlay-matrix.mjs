import { existsSync } from "node:fs";
import { join } from "node:path";
import { walk, read } from "./lib.mjs";
import { gateResult } from "./config.mjs";
import { CASES_FILE, MOUNTS_FILE, documentableComponents } from "./docs-lib.mjs";

// @adr 009 - a component is not finished until every cell of its row is filled
//
// "Fully tested" is only checkable as a matrix: component × state → unit test, harness
// case, browser test, documentation. Each cell already has its own gate somewhere —
// coverage, parity test, docs:verify — but nothing asked the question PER COMPONENT,
// so a new primitive could ship with a unit test and no browser case and every gate
// would stay green. This is the gate that closes that: a missing cell names the
// component and the cell, and an exported component with no classification fails
// rather than defaulting to exempt.
//
// The classification is DATA (Case.kind in src/harness/cases.ts):
//   surface     needs everything, plus a case proving it wins a hit test
//   visual      needs everything
//   structural  renders no markup: needs a unit test and a documented exemption,
//               and must NOT have a mount — a picture of a provider is a picture
//               of its child.

const E2E_SUITE = "e2e/component-library.e2e.ts";
const errors = [];

/** The registry, parsed as data. cases.ts is a flat array of object literals. */
function parseCases() {
  if (!existsSync(CASES_FILE)) return null;
  const src = read(CASES_FILE);
  const body = /export const cases[^=]*=\s*\[([\s\S]*)\];/.exec(src)?.[1];
  if (body === undefined) return null;
  const out = [];
  for (const block of body.split(/\},\s*\{/)) {
    const id = /id:\s*"([^"]+)"/.exec(block)?.[1];
    const component = /component:\s*"([^"]+)"/.exec(block)?.[1];
    const kind = /kind:\s*"([^"]+)"/.exec(block)?.[1];
    if (id === undefined || component === undefined || kind === undefined) continue;
    out.push({ id, component, kind, topmost: /topmost:\s*"[^"]+"/.test(block) });
  }
  return out;
}

const parsed = parseCases();
if (parsed === null) {
  errors.push(`${CASES_FILE} is missing or unparsable — the matrix has no rows to check`);
}
const registry = parsed ?? [];

const mountIds = new Set(
  existsSync(MOUNTS_FILE) ? [...read(MOUNTS_FILE).matchAll(/^  "([a-z0-9-]+)":/gm)].map((m) => m[1]) : [],
);

// Unit tests: every test file in the library, searched once. A component's cell is
// filled when some unit test exercises it by name — which covers components whose test
// lives beside a differently-named file (ProtoUIProvider in providers.test.tsx).
const testFiles = walk("packages/proto-ui", (p) => /\.test\.tsx?$/.test(p));
const testCorpus = testFiles.map((p) => read(p)).join("\n");

const suiteReadsRegistry =
  existsSync(E2E_SUITE) && read(E2E_SUITE).includes("harness/cases");

const docFor = (component) => join("docs", "components", component, "README.md");
const NO_SHOT = /<!--\s*no-screenshot:\s*(.{10,}?)\s*-->/;
const IMAGE = /!\[[^\]]*\]\([^)]+\.png\)/;

for (const component of documentableComponents()) {
  const rows = registry.filter((c) => c.component === component);

  if (rows.length === 0) {
    errors.push(
      `${component}: no case in ${CASES_FILE} — classify it (surface | visual | structural); ` +
        `the default is not "exempt"`,
    );
    continue;
  }

  const kinds = new Set(rows.map((c) => c.kind));
  if (kinds.size > 1) {
    errors.push(`${component}: cases disagree on kind (${[...kinds].join(", ")}) — a component is one thing`);
    continue;
  }
  const kind = rows[0].kind;

  // Cell: unit test.
  if (!new RegExp(`\\b${component}\\b`).test(testCorpus)) {
    errors.push(`${component}: no unit test in packages/proto-ui exercises it — that cell is empty`);
  }

  // Cell: harness mount (renderable) / deliberate absence (structural).
  if (kind === "structural") {
    for (const row of rows) {
      if (mountIds.has(row.id)) {
        errors.push(`${component}: structural, but ${MOUNTS_FILE} mounts "${row.id}" — a picture of it would be a picture of its child`);
      }
    }
  } else {
    for (const row of rows) {
      if (!mountIds.has(row.id)) {
        errors.push(`${component}: case "${row.id}" has no mount in ${MOUNTS_FILE} — no harness case, nothing to photograph or test`);
      }
    }
  }

  // Cell: browser test. Generated from the registry, so the cell is filled by
  // construction once the suite exists and reads it; asserted so deleting the suite
  // (or pointing it elsewhere) empties every browser cell loudly.
  if (kind !== "structural" && !suiteReadsRegistry) {
    errors.push(`${component}: ${E2E_SUITE} is missing or does not read ${CASES_FILE} — the browser cell is empty`);
  }

  // Cell: a surface must prove it wins a hit test.
  if (kind === "surface" && !rows.some((c) => c.topmost) ) {
    errors.push(`${component}: a surface with no case asserting topmost — the layering claim is untested for it`);
  }

  // Cell: documentation. Freshness is docs:verify's job; presence-with-evidence is this
  // gate's, so an undocumented component fails HERE with the matrix vocabulary.
  const doc = docFor(component);
  if (!existsSync(doc)) {
    errors.push(`${component}: not documented — ${doc} does not exist`);
  } else {
    const body = read(doc);
    if (kind === "structural") {
      if (!NO_SHOT.test(body)) {
        errors.push(`${component}: structural, so ${doc} must state <!-- no-screenshot: reason -->`);
      }
    } else if (!IMAGE.test(body) && !NO_SHOT.test(body)) {
      errors.push(`${component}: ${doc} shows no screenshot and states no reason`);
    }
  }
}

// The reverse direction: a case for a component the library does not export is a row
// about nothing.
const exported = new Set(documentableComponents());
for (const row of registry) {
  if (!exported.has(row.component)) {
    errors.push(`${CASES_FILE}: case "${row.id}" is for "${row.component}", which @jj/proto-ui does not export`);
  }
}

gateResult(
  "overlay",
  `overlay:matrix: ${exported.size} components × (unit, harness, browser, docs) — no empty cells`,
  errors,
);

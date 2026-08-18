import { existsSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { hashFiles, isProd, read, walk } from "./lib.mjs";

// Shared vocabulary for the documentation and addressability gates: where the route
// registry lives, what the documentable subjects are, and how "is this captured
// example still current?" is answered (BR-25 / BR-26).

/** The e2e/docs scenario registry — the backend analogue of the web harness. */
export const CASES_FILE = "src/harness/cases.ts";

/** The lock that pins which handler sources the captured examples were taken from. */
export const EXAMPLES_LOCK = "docs/api/.examples.lock";

/** Route definitions live only here; opid:scan fails a path literal anywhere else. */
export const ROUTES_DIR = "src/adapters/in/http";

/** Every production route-definition file (the registry and its per-slice tables). */
export function routeFiles() {
  return walk(ROUTES_DIR, isProd).sort();
}

/**
 * operationId → file, parsed from the route definition objects. The ids are the
 * backend's addressability surface (BR-25): contract clients, docs examples and
 * e2e scenarios all key on them.
 */
export function operationIds() {
  const ids = [];
  for (const file of routeFiles()) {
    for (const m of read(file).matchAll(/operationId:\s*"([^"]+)"/g)) {
      ids.push({ id: m[1], file });
    }
  }
  return ids;
}

/** The handler sources whose bytes decide whether a captured example is stale. */
export function handlerSources() {
  return ["src/domain", "src/application", "src/adapters"]
    .flatMap((dir) => walk(dir, isProd))
    .sort();
}

/** One hash over every handler source: editing any handler invalidates the capture. */
export function handlerSourceHash() {
  return hashFiles(handlerSources());
}

/** The problem catalogue's page is flat: it documents codes, not one operation. */
export const PROBLEMS_DOC = "docs/api/problems.md";

export const docFor = (subject) => (subject === "problems" ? PROBLEMS_DOC : join("docs", "api", subject, "README.md"));
export const examplesDirFor = (subject) => join("docs", "api", subject, "examples");

export function readExamplesLock() {
  if (!existsSync(EXAMPLES_LOCK)) return null;
  return JSON.parse(read(EXAMPLES_LOCK));
}

// --- the decision half of the lock (BR-42) --------------------------------------
// A captured exchange can be a perfect record of an endpoint that implements a
// decision nobody holds any more: change the ADR alone and the handler hash above
// does not move, because the handlers did not. So the lock also records the
// DECISIONS these handlers implement, discovered from the `// @adr NNN` anchors
// already in them — never a hand-written list, which is a second source of truth
// and drifts the moment an anchor moves.

/** ADR numbers anchored in these sources, sorted, deduplicated. */
export function anchoredAdrs(sources = handlerSources()) {
  const found = new Set();
  for (const p of sources) {
    for (const m of read(p).matchAll(/@adr\s+(\d{3})\b/g)) found.add(m[1]);
  }
  return [...found].sort();
}

/**
 * `{ "030": <sha256 of the decision> }` for each anchored ADR.
 *
 * The hash covers the ADR from its first `## ` heading down, NOT the whole file.
 * Frontmatter moves when a status flips proposed → accepted and when a prompt-log
 * link is backfilled; both are changes to the EVIDENCE for a decision, not to the
 * decision, and staling every page over them would train people to re-lock without
 * reading. What is left is the decision itself.
 */
export function adrDigests(numbers) {
  const digests = {};
  for (const n of numbers) {
    const dir = "docs/adr";
    const file = existsSync(dir) ? readdirSync(dir).find((f) => f.startsWith(`${n}-`)) : undefined;
    // A missing ADR is adr:lint's finding, not this gate's.
    digests[n] = file === undefined ? "absent" : sha256(adrBody(read(join(dir, file))));
  }
  return digests;
}

const sha256 = (s) => createHash("sha256").update(s).digest("hex");
const adrBody = (markdown) => {
  const i = markdown.indexOf("\n## ");
  return i === -1 ? markdown : markdown.slice(i);
};

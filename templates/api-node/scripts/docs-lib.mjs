import { existsSync } from "node:fs";
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

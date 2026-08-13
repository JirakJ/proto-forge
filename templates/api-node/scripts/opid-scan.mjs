import { read, walk, isProd } from "./lib.mjs";
import { gateResult } from "./config.mjs";
import { routeFiles, ROUTES_DIR } from "./docs-lib.mjs";

// @adr 008 - every operation has a unique, deterministic operationId (BR-25)
//
// The testid lesson applies verbatim to a service: an operation nothing can name
// reliably is an operation nothing can test, document or generate a client for
// without guessing. Every route carries a kebab-case `<resource>-<verb>` id,
// unique across the app, and every route PATH lives in the route registry
// (src/adapters/in/http) — a path literal registered ad hoc on the server
// instance is an operation the contract cannot see.

// resource-verb: lowercase kebab-case with AT LEAST one hyphen — "notes" is a
// resource, not an operation.
const GRAMMAR = /^[a-z][a-z0-9]*(-[a-z0-9]+)+$/;

const errors = [];
const seen = new Map();
let total = 0;

for (const file of routeFiles()) {
  const text = read(file);
  for (const m of text.matchAll(/operationId:\s*"([^"]*)"/g)) {
    total += 1;
    const id = m[1];
    if (!GRAMMAR.test(id)) {
      errors.push(`${file}: operationId "${id}" does not match <resource>-<verb> kebab-case (${GRAMMAR})`);
    }
    const previous = seen.get(id);
    if (previous !== undefined) errors.push(`operationId "${id}" is declared twice: ${previous} and ${file} — ids are unique across the app`);
    seen.set(id, file);
  }
}

if (total === 0) errors.push(`${ROUTES_DIR}: no operationId declarations found — the route registry is empty or unparseable`);

// --- no route path literal outside the registry -------------------------------
// `app.get("/x", ...)`, `app.route({...})` and friends wire fastify directly. The
// ONLY file allowed to touch the server instance is the registry-driven app.ts —
// anywhere else it is a route the contract, the docs and the e2e suite cannot see.
const APP_FILE = `${ROUTES_DIR}/app.ts`;
// An HTTP verb called with a "/..." literal, or a .route({...}) object. The path
// prefix is what keeps Map.get("key") and friends out of the findings.
const REGISTRATION = /\b\w+\.(get|post|put|patch|delete)\s*\(\s*["'`]\/|\.route\s*\(\s*\{/;

for (const file of walk("src", isProd)) {
  if (file === APP_FILE) continue;
  if (file.startsWith("src/test/") || file.startsWith("src/harness/") || file.includes("__fixtures__")) continue;
  // The byte-pinned platform kernel owns the operational endpoints (/healthz,
  // /version) — deliberately OUTSIDE the contract: they carry no operationId, no
  // docs page and no captured example, and changing them is a seed bump, not an
  // app change. Everything the API's consumers see still comes from the registry.
  if (file.startsWith("src/platform/")) continue;
  const text = read(file);
  for (const line of text.split("\n")) {
    if (REGISTRATION.test(line)) {
      errors.push(
        `${file}: a route path literal outside the registry — "${line.trim().slice(0, 80)}"; ` +
          `routes are entries in ${ROUTES_DIR}/routes.ts, wired only by ${APP_FILE} (BR-25)`,
      );
    }
  }
}

gateResult("opid", `opid:scan: ${total} operation id(s), unique, deterministic, registry-only paths`, errors);

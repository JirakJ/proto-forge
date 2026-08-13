import { read, walk, isProd } from "./lib.mjs";
import { gateResult } from "./config.mjs";
import { routeFiles, ROUTES_DIR } from "./docs-lib.mjs";

// @adr 008 - every operation has a unique, deterministic operationId (BR-25)
//
// The testid lesson applies verbatim to a service: an operation nothing can name
// reliably is an operation nothing can test, document or generate a client for
// without guessing. Every route carries a kebab-case `<resource>-<verb>` id,
// unique across the app, and every route PATH lives in the route registry
// (src/app/adapters/inbound/http) — a path literal registered ad hoc on the app
// instance is an operation the contract cannot see.

// resource-verb: lowercase kebab-case with AT LEAST one hyphen — "notes" is a
// resource, not an operation.
const GRAMMAR = /^[a-z][a-z0-9]*(-[a-z0-9]+)+$/;

const errors = [];
const seen = new Map();
let total = 0;

for (const file of routeFiles()) {
  const text = read(file);
  for (const m of text.matchAll(/operation_id="([^"]*)"/g)) {
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

if (total === 0) errors.push(`${ROUTES_DIR}: no operation_id declarations found — the route registry is empty or unparseable`);

// --- no route path literal outside the registry -------------------------------
// `@app.get("/x")`, `app.add_api_route("/x", ...)` and `APIRouter()` wire FastAPI
// directly. The ONLY file allowed to touch the app instance is the
// registry-driven app.py — anywhere else it is a route the contract, the docs
// and the e2e suite cannot see.
const APP_FILE = `${ROUTES_DIR}/app.py`;
// An HTTP verb decorated/called with a "/..." literal, or add_api_route/APIRouter.
const REGISTRATION = /\b\w+\.(get|post|put|patch|delete)\s*\(\s*["']\/|\.add_api_route\s*\(|\bAPIRouter\s*\(/;

for (const file of walk("src", isProd)) {
  if (file === APP_FILE) continue;
  if (file.startsWith("src/app/harness/") || file.startsWith("src/app/e2e/") || file.includes("__fixtures__")) continue;
  // The byte-pinned platform kernel owns the operational endpoints (/healthz,
  // /version) — deliberately OUTSIDE the contract: they carry no operationId, no
  // docs page and no captured example, and changing them is a seed bump, not an
  // app change. Everything the API's consumers see still comes from the registry.
  if (file.startsWith("src/app/platform/")) continue;
  const text = read(file);
  for (const line of text.split("\n")) {
    if (REGISTRATION.test(line)) {
      errors.push(
        `${file}: a route path literal outside the registry — "${line.trim().slice(0, 80)}"; ` +
          `routes are entries in ${ROUTES_DIR}/routes.py, wired only by ${APP_FILE} (BR-25)`,
      );
    }
  }
}

gateResult("opid", `opid:scan: ${total} operation id(s), unique, deterministic, registry-only paths`, errors);

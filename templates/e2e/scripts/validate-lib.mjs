import { existsSync, readFileSync } from "node:fs";
import { join, resolve, dirname, isAbsolute } from "node:path";

// @adr 001 - one validator, three consumers
//
// A minimal STRUCTURAL JSON-schema-subset validator: type / required /
// properties / items / enum / const / additionalProperties:false / min-max
// length / pattern / format-lite (uuid, date-time), plus in-document $ref and
// anyOf-oneOf. Dependency-free ON PURPOSE — this repo ships zero runtime
// dependencies, and the subset the generated OpenAPI contracts actually use is
// small enough that vendoring a full validator would be surface without
// behaviour. Honest limit: this is a SUBSET; a schema feature outside it is
// IGNORED (never a false failure), so a passing validation means "nothing the
// subset checks is violated", which is exactly what a consumer-driven probe
// needs.
//
// Plain .mjs so THREE consumers share one implementation: the Playwright suite
// (via the thin typed facade src/contract/validate.ts), registry-verify.mjs,
// and the gates-selftest fixtures that prove it rejects what a contract forbids.

const FORMATS = {
  uuid: /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/,
  "date-time": /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/,
};

const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

function typeOf(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (typeof value === "number") return Number.isInteger(value) ? "integer" : "number";
  return typeof value;
}

function typeMatches(declared, value) {
  const actual = typeOf(value);
  if (declared === "number") return actual === "number" || actual === "integer";
  return declared === actual;
}

/** Resolve an in-document "#/..." JSON pointer. Anything else is out of scope. */
export function resolveRef(root, ref) {
  if (typeof ref !== "string" || !ref.startsWith("#/")) return undefined;
  let node = root;
  for (const raw of ref.slice(2).split("/")) {
    const key = raw.replaceAll("~1", "/").replaceAll("~0", "~");
    if (!isObject(node) && !Array.isArray(node)) return undefined;
    node = node[key];
    if (node === undefined) return undefined;
  }
  return node;
}

/**
 * Validate `value` against `schema`. Returns a list of human-readable error
 * strings — empty means nothing the subset checks is violated.
 */
export function validateAgainstSchema(schema, value, root = schema, path = "$", depth = 0) {
  if (!isObject(schema)) return [];
  if (depth > 64) return [`${path}: schema nesting exceeds the validator's depth cap`];

  if (typeof schema.$ref === "string") {
    const target = resolveRef(root, schema.$ref);
    if (target === undefined) return [`${path}: unresolvable $ref "${schema.$ref}"`];
    return validateAgainstSchema(target, value, root, path, depth + 1);
  }

  const errors = [];
  errors.push(...checkBranches(schema, value, root, path, depth));
  errors.push(...checkScalar(schema, value, path));
  errors.push(...checkObject(schema, value, root, path, depth));
  errors.push(...checkArray(schema, value, root, path, depth));
  return errors;
}

function checkBranches(schema, value, root, path, depth) {
  const branches = schema.anyOf ?? schema.oneOf;
  if (!Array.isArray(branches) || branches.length === 0) return [];
  const attempts = branches.map((b) => validateAgainstSchema(b, value, root, path, depth + 1));
  if (attempts.some((a) => a.length === 0)) return [];
  return [`${path}: matches none of the ${branches.length} anyOf/oneOf branches (first branch said: ${attempts[0][0]})`];
}

function checkScalar(schema, value, path) {
  const errors = [];
  if (schema.type !== undefined) {
    const declared = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!declared.some((t) => typeMatches(t, value))) {
      errors.push(`${path}: expected type ${declared.join("|")}, got ${typeOf(value)}`);
      return errors; // the shape is wrong; deeper checks would only echo it
    }
  }
  if (Array.isArray(schema.enum) && !schema.enum.some((e) => JSON.stringify(e) === JSON.stringify(value))) {
    errors.push(`${path}: value ${JSON.stringify(value)} is not one of the enum ${JSON.stringify(schema.enum)}`);
  }
  if (schema.const !== undefined && JSON.stringify(schema.const) !== JSON.stringify(value)) {
    errors.push(`${path}: value ${JSON.stringify(value)} is not the const ${JSON.stringify(schema.const)}`);
  }
  if (typeof value === "string") {
    if (typeof schema.minLength === "number" && value.length < schema.minLength) {
      errors.push(`${path}: string shorter than minLength ${schema.minLength}`);
    }
    if (typeof schema.maxLength === "number" && value.length > schema.maxLength) {
      errors.push(`${path}: string longer than maxLength ${schema.maxLength}`);
    }
    if (typeof schema.pattern === "string" && !new RegExp(schema.pattern).test(value)) {
      errors.push(`${path}: string does not match pattern ${schema.pattern}`);
    }
    const format = FORMATS[schema.format];
    if (format !== undefined && !format.test(value)) {
      errors.push(`${path}: string is not a well-formed ${schema.format}`);
    }
  }
  return errors;
}

function checkObject(schema, value, root, path, depth) {
  if (!isObject(value)) return [];
  const errors = [];
  const properties = isObject(schema.properties) ? schema.properties : {};
  if (Array.isArray(schema.required)) {
    for (const key of schema.required) {
      if (value[key] === undefined) errors.push(`${path}: missing required property "${key}"`);
    }
  }
  for (const [key, sub] of Object.entries(properties)) {
    if (value[key] !== undefined) errors.push(...validateAgainstSchema(sub, value[key], root, `${path}.${key}`, depth + 1));
  }
  if (schema.additionalProperties === false) {
    for (const key of Object.keys(value)) {
      if (properties[key] === undefined) errors.push(`${path}: property "${key}" is not allowed (additionalProperties: false)`);
    }
  }
  return errors;
}

function checkArray(schema, value, root, path, depth) {
  if (!Array.isArray(value) || !isObject(schema.items)) return [];
  const errors = [];
  for (const [i, item] of value.entries()) {
    errors.push(...validateAgainstSchema(schema.items, item, root, `${path}[${i}]`, depth + 1));
  }
  return errors;
}

/** The operation a contract declares under this operationId, or undefined. */
export function findOperation(spec, operationId) {
  const paths = isObject(spec) && isObject(spec.paths) ? spec.paths : {};
  for (const [path, operations] of Object.entries(paths)) {
    if (!isObject(operations)) continue;
    for (const [method, operation] of Object.entries(operations)) {
      if (isObject(operation) && operation.operationId === operationId) return { path, method, operation };
    }
  }
  return undefined;
}

/** Every operationId a contract declares, sorted — for error messages and parity checks. */
export function listOperationIds(spec) {
  const ids = [];
  const paths = isObject(spec) && isObject(spec.paths) ? spec.paths : {};
  for (const operations of Object.values(paths)) {
    if (!isObject(operations)) continue;
    for (const operation of Object.values(operations)) {
      if (isObject(operation) && typeof operation.operationId === "string") ids.push(operation.operationId);
    }
  }
  return ids.sort();
}

/** The JSON(-ish) response schema an operation declares for a status, or undefined (e.g. 204). */
export function responseSchema(operation, status) {
  const responses = isObject(operation) && isObject(operation.responses) ? operation.responses : {};
  const response = responses[String(status)];
  if (!isObject(response) || !isObject(response.content)) return undefined;
  for (const [contentType, media] of Object.entries(response.content)) {
    if (/json/.test(contentType) && isObject(media) && media.schema !== undefined) {
      return { contentType, schema: media.schema };
    }
  }
  return undefined;
}

/**
 * Where the consumer's contract lives (BR-22 through the workspace, T14):
 *   1. E2E_CONTRACT — an explicit override, resolved from cwd
 *   2. ../workspace.json contract.source — the manifest is the single source
 *   3. ../api/contract/openapi.json — the conventional pair layout
 * Existence is the CALLER's concern: pre-workspace, the file is legitimately
 * absent and each consumer decides between a note (locally) and a failure (CI).
 */
export function locateContract({ cwd = process.cwd(), env = process.env } = {}) {
  const override = env.E2E_CONTRACT;
  if (typeof override === "string" && override !== "") {
    return { path: isAbsolute(override) ? override : resolve(cwd, override), origin: "E2E_CONTRACT" };
  }
  const workspaceRoot = dirname(resolve(cwd));
  const manifestPath = join(workspaceRoot, "workspace.json");
  if (existsSync(manifestPath)) {
    try {
      const source = JSON.parse(readFileSync(manifestPath, "utf8")).contract?.source;
      if (typeof source === "string" && source !== "") {
        return { path: resolve(workspaceRoot, source), origin: "workspace.json contract.source" };
      }
    } catch {
      // An unreadable manifest is the workspace's ws:verify finding, not ours.
    }
  }
  return { path: join(workspaceRoot, "api", "contract", "openapi.json"), origin: "pair convention ../api/contract/openapi.json" };
}

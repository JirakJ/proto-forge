import { existsSync } from "node:fs";
import { read, ok } from "./lib.mjs";
import { gateResult } from "./config.mjs";

// @adr 008 - a breaking contract change needs a contract major bump plus an ADR (BR-22)
//
// Baseline = contract/released/openapi.json, the last RELEASED contract, committed
// at release time. Against it this gate detects the conservative breaking set in
// pure JS (no oasdiff dependency — the template's own dependency budget applies to
// its gates too): removed paths, removed methods, removed operationIds, removed
// response status codes, NEW required request-body fields, and removed required
// response fields. Breaking findings pass ONLY when contract.lock's
// contractVersion major is above the baseline's info.version major.

const BASELINE = "contract/released/openapi.json";
const SPEC = "contract/openapi.json";
const LOCK = "contract/contract.lock";

if (!existsSync(BASELINE)) {
  ok("contract:breaking: no released baseline yet — first release publishes it");
  process.exit(0);
}

const errors = [];
const findings = [];

if (!existsSync(SPEC)) {
  errors.push(`${SPEC} is missing — nothing to compare against the released baseline`);
  gateResult("contract", "contract:breaking", errors);
  process.exit(0);
}

const base = JSON.parse(read(BASELINE));
const current = JSON.parse(read(SPEC));
const METHODS = ["get", "post", "put", "patch", "delete", "head", "options"];

const operations = (spec) => {
  const out = [];
  for (const [path, item] of Object.entries(spec.paths ?? {})) {
    for (const method of METHODS) {
      if (item[method] !== undefined) out.push({ path, method, op: item[method] });
    }
  }
  return out;
};

const baseOps = operations(base);
const currentOps = operations(current);
const currentByKey = new Map(currentOps.map((o) => [`${o.method} ${o.path}`, o.op]));
const currentIds = new Set(currentOps.map((o) => o.op.operationId).filter(Boolean));

// --- removed paths / methods / operationIds ----------------------------------
for (const path of Object.keys(base.paths ?? {})) {
  if ((current.paths ?? {})[path] === undefined) findings.push(`path removed: ${path}`);
}
for (const { path, method, op } of baseOps) {
  if ((current.paths ?? {})[path] === undefined) continue; // already reported
  if (!currentByKey.has(`${method} ${path}`)) findings.push(`method removed: ${method.toUpperCase()} ${path}`);
  else if (op.operationId !== undefined && !currentIds.has(op.operationId)) {
    findings.push(`operationId removed: ${op.operationId}`);
  }
}

// --- narrowed responses and request/response schema breaks -------------------
const bodySchema = (op) => op.requestBody?.content?.["application/json"]?.schema;
const responseSchema = (op, status) => op.responses?.[status]?.content?.["application/json"]?.schema;

for (const { path, method, op } of baseOps) {
  const now = currentByKey.get(`${method} ${path}`);
  if (now === undefined) continue;
  const at = `${method.toUpperCase()} ${path}`;

  for (const status of Object.keys(op.responses ?? {})) {
    if ((now.responses ?? {})[status] === undefined) findings.push(`${at}: response ${status} removed`);
  }

  // A request field the baseline did not require, now required: existing clients break.
  const wasRequired = new Set(bodySchema(op)?.required ?? []);
  for (const field of bodySchema(now)?.required ?? []) {
    if (!wasRequired.has(field)) findings.push(`${at}: request body newly requires "${field}"`);
  }

  // A response field the baseline required, now gone: existing consumers break.
  for (const status of Object.keys(op.responses ?? {})) {
    const baseResponse = responseSchema(op, status);
    const nowResponse = responseSchema(now, status);
    if (baseResponse === undefined || nowResponse === undefined) continue;
    const nowProps = nowResponse.properties ?? {};
    for (const field of baseResponse.required ?? []) {
      if (nowProps[field] === undefined) findings.push(`${at}: response ${status} no longer carries required "${field}"`);
    }
  }
}

// --- the verdict: breaking is legal only across a major bump ------------------
if (findings.length > 0) {
  const baseMajor = Number(String(base.info?.version ?? "0").split(".")[0]);
  const lockVersion = existsSync(LOCK) ? JSON.parse(read(LOCK)).contractVersion : undefined;
  const currentMajor = Number(String(lockVersion ?? "0").split(".")[0]);
  if (!(currentMajor > baseMajor)) {
    errors.push(...findings.map((f) => `breaking against ${BASELINE}: ${f}`));
    errors.push(
      `contract ${lockVersion ?? "(no lock)"} vs released ${base.info?.version ?? "?"} — ` +
        `a breaking change needs a contract major bump plus an ADR`,
    );
  }
}

gateResult(
  "contract",
  findings.length === 0
    ? "contract:breaking: no breaking change against the released baseline"
    : `contract:breaking: ${findings.length} breaking change(s), covered by a contract major bump`,
  errors,
);

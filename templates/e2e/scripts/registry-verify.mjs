import { existsSync, readFileSync } from "node:fs";
import { walk, read, note } from "./lib.mjs";
import { gateResult } from "./config.mjs";
import { listOperationIds, locateContract } from "./validate-lib.mjs";

// @adr 001 - the case registries are the suites' single source, held from OUTSIDE
//
// Gate "registry" (BR-35). The two suites are GENERATED from pure-data
// registries (the web template's harness pattern), which buys one property this
// gate must then defend: the registry and the code that serves it cannot drift,
// because a drift is a parse away from detection. Checked mechanically:
//
//   1. both registries exist, export their case list, and every id is unique
//      and kebab-case (ids are test names — grammar is the API)
//   2. every contract case is complete: one operationId and one expectation
//      per id
//   3. FLOW PARITY: every flow case has an implementation in src/flows/*.flow.ts
//      and every implementation has a case — same guarantee the web template's
//      registry↔mounts parity gives, proven where deleting the test file
//      cannot delete the check
//   4. the generated specs still consume the registries (a deleted or unwired
//      spec silently drops a whole suite)
//   5. every contract case names an operationId the referenced contract defines
//      — WHEN the contract is reachable. Pre-workspace it legitimately is not:
//      that is a printed note, never a silent pass, and the workspace pair (or
//      E2E_CONTRACT) turns the check on.

const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const errors = [];

const FLOWS = "src/flows/cases.ts";
const CONTRACT = "src/contract/cases.ts";

// Everything is extracted from the EXPORTED ARRAY LITERAL onward — the type
// definitions above it legitimately mention the same field names. The registry
// convention (documented in both cases.ts files) is that every case OBJECT
// OPENS WITH ITS id FIELD, so `{ id: "…"` is one case, independent of how the
// formatter laid the object out — and an `id` buried in a request body never
// counts as a case.
const flowListing = registryListing(FLOWS, "flowCases");
const contractListing = registryListing(CONTRACT, "contractCases");
const CASE_ID = /\{\s*id:\s*"([^"]*)"/g;
const flowIds = matches(flowListing, CASE_ID);
const contractIds = matches(contractListing, CASE_ID);

// --- id grammar and uniqueness, across BOTH registries -------------------------
const all = [...flowIds, ...contractIds];
const seen = new Set();
for (const id of all) {
  if (!KEBAB.test(id)) errors.push(`case id "${id}" is not kebab-case — ids are test names, the grammar is the API`);
  if (seen.has(id)) errors.push(`duplicate case id "${id}" — ids are unique across the flow AND contract registries`);
  seen.add(id);
}

// --- contract cases are complete ------------------------------------------------
if (contractListing !== "") {
  const operationIds = matches(contractListing, /\boperationId:\s*"([^"]+)"/g);
  const expectations = matches(contractListing, /\bexpectation:\s*\{/g);
  if (operationIds.length !== contractIds.length || expectations.length !== contractIds.length) {
    errors.push(
      `${CONTRACT}: ${contractIds.length} case id(s) but ${operationIds.length} operationId(s) and ` +
        `${expectations.length} expectation(s) — every contract case carries exactly one of each`,
    );
  }

  // --- operation existence, when the contract is reachable ----------------------
  const { path, origin } = locateContract();
  if (existsSync(path)) {
    let known;
    try {
      known = listOperationIds(JSON.parse(readFileSync(path, "utf8")));
    } catch (e) {
      errors.push(`the contract at ${path} (${origin}) does not parse: ${e.message}`);
    }
    if (known !== undefined) {
      for (const opId of new Set(operationIds)) {
        if (!known.includes(opId)) {
          errors.push(`contract case names unknown operation "${opId}" — the contract at ${path} defines: ${known.join(", ")}`);
        }
      }
    }
  } else {
    note(`registry: contract not reachable at ${path} (${origin}) — pre-workspace state; operation existence unchecked until the pair exists`);
  }
}

// --- flow parity: registry ↔ implementations -----------------------------------
const implementationIds = walk("src/flows", (f) => f.endsWith(".flow.ts")).flatMap((f) =>
  matches(read(f), /^\s*"([a-z0-9-]+)":\s*async/gm),
);
for (const id of flowIds) {
  if (!implementationIds.includes(id)) {
    errors.push(`flow case "${id}" has no spec coverage — no implementation keyed "${id}" in src/flows/*.flow.ts`);
  }
}
for (const id of implementationIds) {
  if (!flowIds.includes(id)) {
    errors.push(`implementation "${id}" has no registry case — src/flows/cases.ts is the single source of scenarios`);
  }
}

// --- the generated specs still consume the registries ---------------------------
for (const [spec, registry] of [
  ["e2e/flows.spec.ts", "src/flows/cases"],
  ["e2e/contract.spec.ts", "src/contract/cases"],
]) {
  if (!existsSync(spec)) errors.push(`${spec} is missing — the generated suite is part of the shipped surface`);
  else if (!read(spec).includes(registry)) errors.push(`${spec} does not import ${registry} — the suite must be generated from the registry`);
}

gateResult(
  "registry",
  `registry: ${flowIds.length} flow case(s) with implementations, ${contractIds.length} contract case(s), ids unique and kebab-case`,
  errors,
);

function registryListing(file, exportName) {
  if (!existsSync(file)) {
    errors.push(`${file} is missing — the registry is the suites' single source`);
    return "";
  }
  const body = read(file);
  const start = body.indexOf(`export const ${exportName}`);
  if (start === -1) {
    errors.push(`${file} does not export "${exportName}" — the generated spec imports exactly that name`);
    return "";
  }
  return body.slice(start);
}

function matches(body, re) {
  return [...body.matchAll(re)].map((m) => m[1]);
}

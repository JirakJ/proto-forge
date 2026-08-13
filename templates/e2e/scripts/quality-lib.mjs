import { existsSync } from "node:fs";
import { read } from "./lib.mjs";

// @adr 001 - the documented quality status is a derivation, never a claim (BR-36)
//
// The shared vocabulary of the quality-status pair: `quality:report` (the
// producer) derives the suite's static facts — the registry case counts and
// the verify chain — into .proto-forge/quality.json and regenerates the
// STATUS.md block from it; `status:verify` (the gate) re-derives everything
// here and fails on any disagreement. This template's verify chain is static
// (the runtime suites belong to the workspace pair), so the facts are counts
// of the committed registries, not tier outputs — still derived, never typed.
// No wall-clock anywhere: freshness is the bond to the same verify run, not a
// timestamp that goes stale by itself.

export const QUALITY_FILE = ".proto-forge/quality.json";
export const STATUS_DOC = "docs/STATUS.md";
export const STATUS_BEGIN = "<!-- quality:begin -->";
export const STATUS_END = "<!-- quality:end -->";

// The derivation sources — the same registries registry:verify parses.
export const FLOWS = "src/flows/cases.ts";
export const CONTRACT_CASES = "src/contract/cases.ts";

/** The verify chain as package.json declares it: split on &&, strip `pnpm run`. */
export function verifyChain(pkg = JSON.parse(read("package.json"))) {
  return (pkg.scripts?.verify ?? "")
    .split("&&")
    .map((s) => s.trim().replace(/^pnpm run\s+/, ""))
    .filter((s) => s !== "");
}

// The registry convention registry-verify.mjs documents: every case OBJECT
// OPENS WITH ITS id FIELD, extracted from the exported array literal onward.
const CASE_ID = /\{\s*id:\s*"([^"]*)"/g;

/**
 * Case count of one registry — null when the file or its export is missing,
 * so the caller can name exactly what vanished instead of reporting zero.
 */
export function caseCount(file, exportName) {
  if (!existsSync(file)) return null;
  const body = read(file);
  const start = body.indexOf(`export const ${exportName}`);
  if (start === -1) return null;
  return [...body.slice(start).matchAll(CASE_ID)].length;
}

/**
 * The STATUS.md block, derived from quality.json ALONE — status:verify
 * re-renders from the same input and compares byte-wise, so a hand edit
 * anywhere between the markers is a caught drift.
 */
export function renderStatusBlock(q) {
  const rows = [
    ["flow cases", String(q.static.flows), "registry ↔ implementation parity"],
    ["contract cases", String(q.static.contractCases), "operation existence when the contract is reachable"],
    ["verify gates", String(q.gates.count), "fail-fast chain"],
  ];
  const table = [
    "| measure | value | enforced by |",
    "| --- | --- | --- |",
    ...rows.map((r) => `| ${r[0]} | ${r[1]} | ${r[2]} |`),
  ].join("\n");
  return `${table}\n\nGate chain: ${q.gates.chain.join(" → ")}`;
}

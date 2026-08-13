import { read } from "./lib.mjs";

// @adr 009 - the documented quality status is a derivation, never a claim (BR-36)
//
// The shared vocabulary of the quality-status pair: `quality:report` (the
// producer) collects the machine outputs the test tiers wrote during THIS
// verify run into .proto-forge/quality.json and regenerates the STATUS.md
// block from it; `status:verify` (the gate) re-derives everything here and
// fails on any disagreement. No wall-clock anywhere: freshness is the bond to
// the same verify run, not a timestamp that goes stale by itself.

export const QUALITY_FILE = ".proto-forge/quality.json";
export const STATUS_DOC = "docs/STATUS.md";
export const STATUS_BEGIN = "<!-- quality:begin -->";
export const STATUS_END = "<!-- quality:end -->";

// The machine outputs, one per test tier. Each is produced by a reporter the
// tier's own config declares — a file that vanishes is a silently weakened doc,
// so quality:report fails on absence rather than shrugging.
export const UNIT_RESULTS = "coverage/test-results.json"; // vitest json reporter
export const COVERAGE_SUMMARY = "coverage/coverage-summary.json"; // @vitest/coverage-v8 json-summary
export const MUTATION_REPORT = "reports/mutation/mutation.json"; // stryker json reporter
export const E2E_RESULTS = ".proto-forge/e2e-results.json"; // written by scripts/e2e-conformance.mjs

// The enforcing configurations and contract sources the report mirrors.
// status:verify re-reads them, so a floor or an operation edited after the
// last report is a caught drift, not a stale doc.
export const COVERAGE_CONFIG = "vitest.config.ts";
export const STRYKER_CONFIG = "stryker.config.json";
export const CONTRACT_FILE = "contract/openapi.json";
export const PROBLEMS_FILE = "src/platform/problems.ts";

/** The verify chain as package.json declares it: split on &&, strip `pnpm run`. */
export function verifyChain(pkg = JSON.parse(read("package.json"))) {
  return (pkg.scripts?.verify ?? "")
    .split("&&")
    .map((s) => s.trim().replace(/^pnpm run\s+/, ""))
    .filter((s) => s !== "");
}

/**
 * The coverage floor the config enforces — the lowest number in the thresholds
 * block (coverage:policy holds them all to one value anyway). Same line-anchored
 * block contract as coverage-policy.mjs: each glob's thresholds sit on ONE line.
 */
export function coverageFloor(src = read(COVERAGE_CONFIG)) {
  const block = /thresholds:\s*\{([\s\S]*?)\n\s*\},/.exec(src)?.[1];
  if (block === undefined) return null;
  const floors = [...block.matchAll(/(?:statements|branches|functions|lines):\s*(\d+)/g)].map((m) => Number(m[1]));
  return floors.length === 0 ? null : Math.min(...floors);
}

/** The mutation-score floor stryker enforces (`thresholds.break`). */
export function mutationBreak(cfg = JSON.parse(read(STRYKER_CONFIG))) {
  return cfg.thresholds?.break ?? null;
}

/**
 * Mutation score from the mutation-testing report schema: detected / valid, in
 * percent, two decimals — the same arithmetic stryker prints, computed here
 * because the json report carries statuses, not a summary number.
 */
export function mutationScore(report) {
  let detected = 0;
  let valid = 0;
  for (const file of Object.values(report.files ?? {})) {
    for (const m of file.mutants ?? []) {
      if (m.status === "Killed" || m.status === "Timeout") {
        detected += 1;
        valid += 1;
      } else if (m.status === "Survived" || m.status === "NoCoverage") {
        valid += 1;
      }
    }
  }
  return valid === 0 ? 100 : Math.round((detected / valid) * 10000) / 100;
}

const METHODS = ["get", "post", "put", "patch", "delete", "head", "options"];

/** Path-method count of the committed contract — one number per operation. */
export function operationCount(contract = JSON.parse(read(CONTRACT_FILE))) {
  let count = 0;
  for (const item of Object.values(contract.paths ?? {})) {
    for (const method of METHODS) if (item[method] !== undefined) count += 1;
  }
  return count;
}

/** Registered problem types: the quoted `code:` literals in the catalogue. */
export function problemCount(src = read(PROBLEMS_FILE)) {
  return new Set([...src.matchAll(/code:\s*"([a-z][a-z0-9-]*)"/g)].map((m) => m[1])).size;
}

/**
 * The STATUS.md block, derived from quality.json ALONE — status:verify
 * re-renders from the same input and compares byte-wise, so a hand edit
 * anywhere between the markers is a caught drift.
 */
export function renderStatusBlock(q) {
  const pct = (v) => `${v}%`;
  const rows = [
    ["unit test files", String(q.unit.files), "—"],
    ["unit tests", `${q.unit.passed}/${q.unit.tests} passed`, "all green"],
    ["coverage: statements", pct(q.coverage.statements), pct(q.thresholds.coverage)],
    ["coverage: branches", pct(q.coverage.branches), pct(q.thresholds.coverage)],
    ["coverage: functions", pct(q.coverage.functions), pct(q.thresholds.coverage)],
    ["coverage: lines", pct(q.coverage.lines), pct(q.thresholds.coverage)],
    ["mutation score", pct(q.mutation.score), `break under ${q.mutation.break}`],
    ["conformance scenarios", `${q.e2e.passed}/${q.e2e.tests} passed`, "all green"],
    ["contract operations", String(q.contract.operations), "—"],
    ["problem types", String(q.contract.problems), "—"],
    ["verify gates", String(q.gates.count), "fail-fast chain"],
  ];
  const table = [
    "| measure | value | enforced floor |",
    "| --- | --- | --- |",
    ...rows.map((r) => `| ${r[0]} | ${r[1]} | ${r[2]} |`),
  ].join("\n");
  return `${table}\n\nGate chain: ${q.gates.chain.join(" → ")}`;
}

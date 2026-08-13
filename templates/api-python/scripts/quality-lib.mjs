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
export const UNIT_RESULTS = "coverage/junit.xml"; // pytest --junitxml (junit_family "legacy" keeps file= attributes)
export const COVERAGE_JSON = "coverage/coverage.json"; // [tool.coverage.json] output
export const MUTATION_SCORE = ".proto-forge/mutation-score.json"; // written by scripts/test-mutation.mjs
export const E2E_RESULTS = ".proto-forge/e2e-results.json"; // written by scripts/e2e-conformance.mjs

// The enforcing configurations and contract sources the report mirrors.
// status:verify re-reads them, so a floor or an operation edited after the
// last report is a caught drift, not a stale doc.
export const COVERAGE_CONFIG = "pyproject.toml"; // [tool.coverage.report] fail_under
export const MUTATION_CONFIG = "pyproject.toml"; // [tool.proto-forge.mutation] break
export const CONTRACT_FILE = "contract/openapi.json";
export const PROBLEMS_FILE = "src/app/platform/problems.py";

/** The verify chain as package.json declares it: split on &&, strip `pnpm run`. */
export function verifyChain(pkg = JSON.parse(read("package.json"))) {
  return (pkg.scripts?.verify ?? "")
    .split("&&")
    .map((s) => s.trim().replace(/^pnpm run\s+/, ""))
    .filter((s) => s !== "");
}

/**
 * The coverage floor the config enforces — `fail_under` in
 * [tool.coverage.report]. coverage.py applies it to the combined line+branch
 * percentage, so at 100 every measured axis is 100 (coverage-policy.mjs holds
 * the value itself).
 */
export function coverageFloor(src = read(COVERAGE_CONFIG)) {
  const m = /\[tool\.coverage\.report\][\s\S]*?fail_under\s*=\s*(\d+)/.exec(src);
  return m === null ? null : Number(m[1]);
}

/** The mutation-score floor the mutation gate enforces ([tool.proto-forge.mutation] break). */
export function mutationBreak(src = read(MUTATION_CONFIG)) {
  const m = /\[tool\.proto-forge\.mutation\][\s\S]*?break\s*=\s*(\d+)/.exec(src);
  return m === null ? null : Number(m[1]);
}

/**
 * Unit counts from the pytest junit report — a regex-level parse on purpose
 * (no XML dependency; NFR-13 counts every line of surface). The first
 * <testsuite> element carries the totals; the per-case file= attributes
 * (junit_family "legacy") name the test files.
 */
export function unitResults(src = read(UNIT_RESULTS)) {
  const suite = /<testsuite\s[^>]*>/.exec(src)?.[0];
  if (suite === undefined) return null;
  const attr = (name) => Number(new RegExp(`\\b${name}="(\\d+)"`).exec(suite)?.[1] ?? 0);
  const tests = attr("tests");
  const failed = attr("failures") + attr("errors") + attr("skipped");
  const files = new Set([...src.matchAll(/<testcase\s[^>]*\bfile="([^"]+)"/g)].map((m) => m[1])).size;
  return { files, tests, passed: tests - failed };
}

const pct2 = (covered, total) => (total === 0 ? 100 : Math.round((covered / total) * 10000) / 100);

/**
 * The two axes coverage.py measures (statements and branches), from the json
 * report's totals — the same arithmetic `coverage report` prints per axis,
 * computed here because fail_under enforces the combined percentage only.
 */
export function coverageTotals(report) {
  const t = report.totals ?? {};
  return {
    statements: pct2(t.covered_lines ?? 0, t.num_statements ?? 0),
    branches: pct2(t.covered_branches ?? 0, t.num_branches ?? 0),
  };
}

/**
 * Mutation score as scripts/test-mutation.mjs recorded it — the strict
 * detected/total arithmetic that gate computes from mutmut's tally, restated
 * here from its machine output rather than re-run.
 */
export function mutationScore(record) {
  return typeof record?.score === "number" ? record.score : null;
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

/** Registered problem types: the quoted `code=` literals in the catalogue. */
export function problemCount(src = read(PROBLEMS_FILE)) {
  return new Set([...src.matchAll(/code="([a-z][a-z0-9-]*)"/g)].map((m) => m[1])).size;
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

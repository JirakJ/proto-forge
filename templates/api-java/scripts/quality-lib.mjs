import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
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
// tier's own build declares — a file that vanishes is a silently weakened doc,
// so quality:report fails on absence rather than shrugging.
export const UNIT_RESULTS_DIR = "build/test-results/test"; // gradle junit xml, one file per test class
export const COVERAGE_REPORT = "build/reports/jacoco/test/jacocoTestReport.xml"; // jacocoTestReport xml.required
export const MUTATION_REPORT = "build/reports/pitest/mutations.xml"; // PIT XML reporter (timestampedReports=false)
export const E2E_RESULTS = ".proto-forge/e2e-results.json"; // written by scripts/e2e-conformance.mjs

// The enforcing configurations and contract sources the report mirrors.
// status:verify re-reads them, so a floor or an operation edited after the
// last report is a caught drift, not a stale doc.
export const COVERAGE_CONFIG = "build.gradle.kts"; // jacocoTestCoverageVerification violation rules
export const MUTATION_CONFIG = "build.gradle.kts"; // pitest { mutationThreshold }
export const CONTRACT_FILE = "contract/openapi.json";
export const PROBLEMS_FILE = "src/main/java/app/platform/Problems.java";

/** The verify chain as package.json declares it: split on &&, strip `pnpm run`. */
export function verifyChain(pkg = JSON.parse(read("package.json"))) {
  return (pkg.scripts?.verify ?? "")
    .split("&&")
    .map((s) => s.trim().replace(/^pnpm run\s+/, ""))
    .filter((s) => s !== "");
}

/**
 * The coverage floor the build enforces — the lowest `minimum` in the
 * jacocoTestCoverageVerification violation rules, as a percentage
 * (coverage-policy.mjs holds every rule to 1.00 anyway).
 */
export function coverageFloor(src = read(COVERAGE_CONFIG)) {
  const floors = [...src.matchAll(/minimum\s*=\s*"([0-9.]+)"/g)].map((m) => Number(m[1]) * 100);
  return floors.length === 0 ? null : Math.min(...floors);
}

/** The mutation-score floor PIT enforces (`mutationThreshold` in the pitest block). */
export function mutationBreak(src = read(MUTATION_CONFIG)) {
  const m = /mutationThreshold\s*=\s*(\d+)/.exec(src);
  return m === null ? null : Number(m[1]);
}

/**
 * Unit counts from gradle's junit xml results — a regex-level parse on purpose
 * (no XML dependency; NFR-13 counts every line of surface). One file per test
 * class; each <testsuite> header carries that class's totals.
 */
export function unitResults(dir = UNIT_RESULTS_DIR) {
  if (!existsSync(dir)) return null;
  const files = readdirSync(dir).filter((f) => f.endsWith(".xml"));
  if (files.length === 0) return null;
  let tests = 0;
  let failed = 0;
  for (const f of files) {
    const suite = /<testsuite\s[^>]*>/.exec(read(join(dir, f)))?.[0];
    if (suite === undefined) continue;
    const attr = (name) => Number(new RegExp(`\\b${name}="(\\d+)"`).exec(suite)?.[1] ?? 0);
    tests += attr("tests");
    failed += attr("failures") + attr("errors") + attr("skipped");
  }
  return { files: files.length, tests, passed: tests - failed };
}

const pct2 = (covered, total) => (total === 0 ? 100 : Math.round((covered / total) * 10000) / 100);

/**
 * Coverage of the ENFORCED scope — the app.domain and app.application packages
 * the violation rules pin to 1.00 — summed from the jacoco XML's package-level
 * counters (the LAST counter of each type inside a <package> block is the
 * package total; earlier ones belong to classes and sourcefiles).
 */
export function coverageCore(src = read(COVERAGE_REPORT)) {
  const sums = { INSTRUCTION: [0, 0], BRANCH: [0, 0], LINE: [0, 0] };
  for (const pkg of src.matchAll(/<package name="([^"]+)">([\s\S]*?)<\/package>/g)) {
    if (!/^app\/(domain|application)/.test(pkg[1])) continue;
    for (const type of Object.keys(sums)) {
      const counters = [...pkg[2].matchAll(new RegExp(`<counter type="${type}" missed="(\\d+)" covered="(\\d+)"`, "g"))];
      const last = counters.at(-1);
      if (last === undefined) continue;
      sums[type][0] += Number(last[2]);
      sums[type][1] += Number(last[1]) + Number(last[2]);
    }
  }
  return {
    instructions: pct2(...sums.INSTRUCTION),
    branches: pct2(...sums.BRANCH),
    lines: pct2(...sums.LINE),
  };
}

/**
 * Mutation score from the PIT XML report: detected / total, in percent, two
 * decimals — the same arithmetic PIT holds mutationThreshold against, computed
 * here because the report carries per-mutation verdicts, not a summary number.
 */
export function mutationScore(src = read(MUTATION_REPORT)) {
  const total = [...src.matchAll(/<mutation /g)].length;
  const detected = [...src.matchAll(/\bdetected=['"]true['"]/g)].length;
  return total === 0 ? 100 : Math.round((detected / total) * 10000) / 100;
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

/** Registered problem types: the `new ProblemDef("<code>"` literals in the catalogue. */
export function problemCount(src = read(PROBLEMS_FILE)) {
  return new Set([...src.matchAll(/new ProblemDef\("([a-z][a-z0-9-]*)"/g)].map((m) => m[1])).size;
}

/**
 * The STATUS.md block, derived from quality.json ALONE — status:verify
 * re-renders from the same input and compares byte-wise, so a hand edit
 * anywhere between the markers is a caught drift.
 */
export function renderStatusBlock(q) {
  const pct = (v) => `${v}%`;
  const rows = [
    ["unit test classes", String(q.unit.files), "—"],
    ["unit tests", `${q.unit.passed}/${q.unit.tests} passed`, "all green"],
    ["coverage: instructions (core)", pct(q.coverage.instructions), pct(q.thresholds.coverage)],
    ["coverage: branches (core)", pct(q.coverage.branches), pct(q.thresholds.coverage)],
    ["coverage: lines (core)", pct(q.coverage.lines), pct(q.thresholds.coverage)],
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

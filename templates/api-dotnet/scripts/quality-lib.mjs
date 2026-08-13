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
// tier's own run declares — a file that vanishes is a silently weakened doc,
// so quality:report fails on absence rather than shrugging.
export const UNIT_RESULTS_DIR = "build/test-results/unit"; // vstest trx, one file per run
export const COVERAGE_REPORT = "build/reports/coverage/coverage.cobertura.xml"; // coverlet cobertura
export const MUTATION_REPORT = "build/reports/stryker/reports/mutation-report.json"; // Stryker.NET json reporter
export const E2E_RESULTS = ".proto-forge/e2e-results.json"; // written by scripts/e2e-conformance.mjs

// The enforcing configurations and contract sources the report mirrors.
// status:verify re-reads them, so a floor or an operation edited after the
// last report is a caught drift, not a stale doc.
export const COVERAGE_CONFIG = "tests/App.Tests/App.Tests.csproj"; // coverlet Threshold contract
export const MUTATION_CONFIG = "stryker-config.json"; // thresholds.break
export const CONTRACT_FILE = "contract/openapi.json";
export const PROBLEMS_FILE = "src/App/Platform/Problems.cs";

/** The verify chain as package.json declares it: split on &&, strip `pnpm run`. */
export function verifyChain(pkg = JSON.parse(read("package.json"))) {
  return (pkg.scripts?.verify ?? "")
    .split("&&")
    .map((s) => s.trim().replace(/^pnpm run\s+/, ""))
    .filter((s) => s !== "");
}

/**
 * The coverage floor the unit tier enforces — the coverlet `Threshold` in the
 * test project, already a percentage (coverage-policy.mjs holds it to 100 anyway).
 */
export function coverageFloor(src = read(COVERAGE_CONFIG)) {
  const m = /<Threshold>\s*([\d.]+)\s*<\/Threshold>/.exec(src);
  return m === null ? null : Number(m[1]);
}

/** The mutation-score floor Stryker.NET enforces (`thresholds.break` in stryker-config.json). */
export function mutationBreak(src = read(MUTATION_CONFIG)) {
  try {
    const breakAt = JSON.parse(src)["stryker-config"]?.thresholds?.break;
    return typeof breakAt === "number" ? breakAt : null;
  } catch {
    return null;
  }
}

/**
 * Unit counts from vstest's trx results — a regex-level parse on purpose
 * (no XML dependency; NFR-13 counts every line of surface). Each trx carries
 * one <Counters> element with the run's totals.
 */
export function unitResults(dir = UNIT_RESULTS_DIR) {
  if (!existsSync(dir)) return null;
  const files = readdirSync(dir).filter((f) => f.endsWith(".trx"));
  if (files.length === 0) return null;
  let tests = 0;
  let passed = 0;
  for (const f of files) {
    const counters = /<Counters\s[^>]*>/.exec(read(join(dir, f)))?.[0];
    if (counters === undefined) continue;
    const attr = (name) => Number(new RegExp(`\\b${name}="(\\d+)"`).exec(counters)?.[1] ?? 0);
    tests += attr("total");
    passed += attr("passed");
  }
  return { files: files.length, tests, passed };
}

const pct2 = (covered, total) => (total === 0 ? 100 : Math.round((covered / total) * 10000) / 100);

/**
 * Coverage of the ENFORCED scope — the App.Domain and App.Application namespaces
 * the coverlet Threshold pins to 100 — summed from the cobertura XML's class
 * blocks: line hits, branch condition-coverage fractions and per-method rates.
 */
export function coverageCore(src = read(COVERAGE_REPORT)) {
  const sums = { lines: [0, 0], branches: [0, 0], methods: [0, 0] };
  for (const cls of src.matchAll(/<class name="([^"]+)"[^>]*>([\s\S]*?)<\/class>/g)) {
    if (!/^App\.(Domain|Application)(\.|$)/.test(cls[1])) continue;
    for (const method of cls[2].matchAll(/<method [^>]*line-rate="([\d.]+)"/g)) {
      sums.methods[0] += Number(method[1]) > 0 ? 1 : 0;
      sums.methods[1] += 1;
    }
    // The class-level <lines> block is the LAST lines section inside the class
    // (earlier ones belong to methods); counting every <line> under the class
    // would double-count, so only the trailing block is measured.
    const linesBlocks = [...cls[2].matchAll(/<lines>([\s\S]*?)<\/lines>/g)];
    const last = linesBlocks.at(-1);
    if (last === undefined) continue;
    for (const line of last[1].matchAll(/<line [^>]*hits="(\d+)"[^>]*\/?>/g)) {
      sums.lines[0] += Number(line[1]) > 0 ? 1 : 0;
      sums.lines[1] += 1;
    }
    for (const cond of last[1].matchAll(/condition-coverage="[\d.]+% \((\d+)\/(\d+)\)"/g)) {
      sums.branches[0] += Number(cond[1]);
      sums.branches[1] += Number(cond[2]);
    }
  }
  return {
    lines: pct2(...sums.lines),
    branches: pct2(...sums.branches),
    methods: pct2(...sums.methods),
  };
}

/**
 * Mutation score from the Stryker.NET JSON report: detected / (detected +
 * undetected), in percent, two decimals — the same arithmetic Stryker holds
 * thresholds.break against, computed here because the report carries
 * per-mutant verdicts, not a summary number.
 */
export function mutationScore(src = read(MUTATION_REPORT)) {
  const report = JSON.parse(src);
  let detected = 0;
  let undetected = 0;
  for (const file of Object.values(report.files ?? {})) {
    for (const mutant of file.mutants ?? []) {
      if (mutant.status === "Killed" || mutant.status === "Timeout") detected += 1;
      else if (mutant.status === "Survived" || mutant.status === "NoCoverage") undetected += 1;
    }
  }
  const total = detected + undetected;
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
    ["unit test runs", String(q.unit.files), "—"],
    ["unit tests", `${q.unit.passed}/${q.unit.tests} passed`, "all green"],
    ["coverage: lines (core)", pct(q.coverage.lines), pct(q.thresholds.coverage)],
    ["coverage: branches (core)", pct(q.coverage.branches), pct(q.thresholds.coverage)],
    ["coverage: methods (core)", pct(q.coverage.methods), pct(q.thresholds.coverage)],
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

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { read, fail, ok } from "./lib.mjs";
import {
  QUALITY_FILE,
  STATUS_DOC,
  STATUS_BEGIN,
  STATUS_END,
  UNIT_RESULTS,
  COVERAGE_SUMMARY,
  MUTATION_REPORT,
  E2E_RESULTS,
  COVERAGE_CONFIG,
  STRYKER_CONFIG,
  verifyChain,
  coverageFloor,
  mutationBreak,
  mutationScore,
  renderStatusBlock,
} from "./quality-lib.mjs";

// @adr 009 - quality:report, the producer half of the status pair (BR-36)
//
// Support tool, wired into verify RIGHT AFTER test:e2e — the last test tier —
// so every number it collects comes from the SAME run the gates just passed.
// It reads the machine outputs the tiers' reporters wrote, distils them into
// .proto-forge/quality.json (no timestamps: freshness is the bond to this run),
// and regenerates the docs/STATUS.md block between the quality markers.
// A missing input is a hard failure: a machine output that vanished is a
// silently weakened doc, not a shrug.
//
// `--summary` prints the current quality.json as markdown to stdout (the CI
// step appends it to $GITHUB_STEP_SUMMARY) and never fails: after a red verify
// there may legitimately be nothing to summarise yet.

if (process.argv.includes("--summary")) {
  process.stdout.write("## quality\n\n");
  if (!existsSync(QUALITY_FILE)) {
    process.stdout.write(`no ${QUALITY_FILE} — the verify run ended before quality:report\n`);
  } else {
    process.stdout.write(`${renderStatusBlock(JSON.parse(read(QUALITY_FILE)))}\n`);
  }
  process.exit(0);
}

const missing = [UNIT_RESULTS, COVERAGE_SUMMARY, MUTATION_REPORT, E2E_RESULTS].filter((p) => !existsSync(p));
if (missing.length > 0) {
  fail("quality:report — expected machine output(s) missing (a report that vanished is a silently weakened doc)", [
    ...missing.map((p) => `${p} is not on disk`),
    "each is written by a reporter the tier's config declares; run the full `pnpm verify` chain",
  ]);
}

const unit = JSON.parse(read(UNIT_RESULTS));
const summary = JSON.parse(read(COVERAGE_SUMMARY)).total;
const mutation = JSON.parse(read(MUTATION_REPORT));
const e2e = JSON.parse(read(E2E_RESULTS)).stats ?? {};

const chain = verifyChain();
const floor = coverageFloor();
const breakAt = mutationBreak();
if (floor === null) fail(`quality:report — no coverage thresholds block in ${COVERAGE_CONFIG}`);
if (breakAt === null) fail(`quality:report — no thresholds.break in ${STRYKER_CONFIG}`);

const e2eTests = (e2e.expected ?? 0) + (e2e.unexpected ?? 0) + (e2e.flaky ?? 0) + (e2e.skipped ?? 0);

// Key order is fixed and the file ends in one newline: the same facts must
// serialise to the same bytes, or the status gate's byte-compare means nothing.
const quality = {
  unit: {
    // testResults carries one entry per test FILE; numTotalTestSuites counts
    // describe blocks, which is not the fact the table names.
    files: Array.isArray(unit.testResults) ? unit.testResults.length : 0,
    tests: unit.numTotalTests ?? 0,
    passed: unit.numPassedTests ?? 0,
  },
  coverage: {
    statements: summary.statements.pct,
    branches: summary.branches.pct,
    functions: summary.functions.pct,
    lines: summary.lines.pct,
  },
  mutation: { score: mutationScore(mutation), break: breakAt },
  e2e: { tests: e2eTests, passed: (e2e.expected ?? 0) + (e2e.flaky ?? 0) },
  gates: { count: chain.length, chain },
  thresholds: { coverage: floor, mutation: breakAt },
};

mkdirSync(dirname(QUALITY_FILE), { recursive: true });
writeFileSync(QUALITY_FILE, JSON.stringify(quality, null, 2) + "\n");

if (!existsSync(STATUS_DOC)) {
  fail(`quality:report — ${STATUS_DOC} is missing; the standing document is part of the template`);
}
const body = read(STATUS_DOC);
const begin = body.indexOf(STATUS_BEGIN);
const end = body.indexOf(STATUS_END);
if (begin === -1 || end === -1 || end < begin) {
  fail(`quality:report — the ${STATUS_BEGIN} … ${STATUS_END} markers are missing from ${STATUS_DOC}`);
}
const next = `${body.slice(0, begin + STATUS_BEGIN.length)}\n${renderStatusBlock(quality)}\n${body.slice(end)}`;
if (next !== body) writeFileSync(STATUS_DOC, next);

ok(
  `quality:report: ${quality.unit.tests} unit + ${quality.e2e.tests} e2e tests, ` +
    `mutation ${quality.mutation.score}%, ${quality.gates.count} gates → ${QUALITY_FILE} + ${STATUS_DOC}`,
);

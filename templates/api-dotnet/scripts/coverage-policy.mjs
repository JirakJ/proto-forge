import { existsSync } from "node:fs";
import { read } from "./lib.mjs";
import { gateResult } from "./config.mjs";

// @adr 003 - the coverage configuration is part of the contract, not a knob
//
// 100% on the behavioural core is only meaningful while two doors stay shut:
// nobody lowers the coverlet Threshold, and nobody adds an exclusion. A hook
// blocks both locally, but hooks do not run in CI — this gate is the same
// promise where it counts. The contract in tests/App.Tests/App.Tests.csproj must
// keep the Threshold at 100 over line, branch and method for the App.Domain +
// App.Application namespaces, and every coverage exclusion must be on the
// allow-list below WITH its stated reason on the line above, so the exclude list
// stays a record instead of becoming a dumping ground. When a coverlet cobertura
// report is on disk, the gated namespaces are re-checked against it too.

const CONFIG = "tests/App.Tests/App.Tests.csproj";
const REPORT = "build/reports/coverage/coverage.cobertura.xml";

/** entry -> the reason its comment must state. Adding a kind of exclusion means editing
 *  this list, which means editing a gate, which is an ADR-visible act. */
const ALLOWED_EXCLUSIONS = new Map([
  ["[App]App.Program", /composition root|bootstrap entr/],
  // No entry for repository ports: a pure-interface type has zero sequence
  // points, and coverlet skips it — an exclusion would record a need that does
  // not exist. Tests, fixtures and the harness live in tests/, which the
  // Include filter never counts, so they need no entry either. The template
  // itself ships ZERO exclusions: the Include scope already confines the
  // floors to the behavioural core.
]);

const errors = [];
if (!existsSync(CONFIG)) {
  errors.push(`${CONFIG} is missing — nothing defines the coverage contract`);
  gateResult("coverage", "coverage:policy", errors);
}

const src = read(CONFIG);

// --- the enforcement contract: 100 over line/branch/method on the core ---------
const threshold = /<Threshold>\s*([\d.]+)\s*<\/Threshold>/.exec(src)?.[1];
if (threshold === undefined) {
  errors.push(`${CONFIG}: no <Threshold> — the floors are gone entirely`);
} else if (Number(threshold) !== 100) {
  errors.push(
    `${CONFIG}: the coverage Threshold is ${threshold} — the floor is 100 everywhere; ` +
      `an unreachable line is a design problem, not a threshold problem`,
  );
}

const thresholdType = /<ThresholdType>\s*([^<]+)\s*<\/ThresholdType>/.exec(src)?.[1] ?? "";
for (const counter of ["line", "branch", "method"]) {
  if (!thresholdType.split(",").map((t) => t.trim()).includes(counter)) {
    errors.push(`${CONFIG}: the ${counter} counter lost its limit — all three counters hold the floor`);
  }
}
if (!/<ThresholdStat>\s*total\s*<\/ThresholdStat>/.test(src)) {
  errors.push(`${CONFIG}: ThresholdStat must be "total" — a per-module average can hide an uncovered corner`);
}

const include = /<Include>\s*([^<]+)\s*<\/Include>/.exec(src)?.[1] ?? "";
for (const scope of ["[App]App.Domain.*", "[App]App.Application.*"]) {
  if (!include.split(",").map((s) => s.trim()).includes(scope)) {
    errors.push(`${CONFIG}: the Include filter no longer covers ${scope} — the behavioural core lost its floor`);
  }
}

// --- exclusions: exactly the allow-list, each with its reason ------------------
// Anchored on the labelled ItemGroup's closing tag on its own line, never on the
// first ">" in the stream, so an entry carrying bracket noise (a character-class
// filter) cannot truncate the block and let every entry after it silently escape
// the allow-list — a tamper-guard that can be blinded by the tamper it guards
// against is no guard.
const excludeBlock = /<ItemGroup Label="coverage-exclusions">([\s\S]*?)\n\s*<\/ItemGroup>/.exec(src)?.[1];
if (excludeBlock === undefined) {
  errors.push(`${CONFIG}: no coverage-exclusions ItemGroup found — the exclusion record is gone`);
} else {
  const lines = excludeBlock.split("\n");
  let lastComment = "";
  for (const line of lines) {
    const comment = /^\s*<!--\s*(.+?)\s*(?:-->)?$/.exec(line);
    if (comment !== null && !/CoverageExclusion/.test(line)) {
      lastComment = `${lastComment} ${comment[1]}`.trim();
      continue;
    }
    const entry = /^\s*<CoverageExclusion\s+Include="([^"]+)"\s*\/>\s*$/.exec(line);
    if (entry === null) continue;
    const required = ALLOWED_EXCLUSIONS.get(entry[1]);
    if (required === undefined) {
      errors.push(
        `${CONFIG}: exclusion "${entry[1]}" is not on the allow-list — a new kind of exclusion ` +
          `is a gate edit and an ADR, not a config tweak`,
      );
    } else if (!required.test(lastComment)) {
      errors.push(
        `${CONFIG}: exclusion "${entry[1]}" has no reason comment (expected one matching ${required}) — ` +
          `the list is a record, and a record states why`,
      );
    }
    lastComment = "";
  }
}

// --- the report half: the gated namespaces measured at the floor ---------------
// coverlet's Threshold enforces this live inside test:unit; re-reading the last
// report catches an Include filter that quietly stopped instrumenting the core
// (a report full of foreign classes) without waiting a full chain.
if (existsSync(REPORT)) {
  const report = read(REPORT);
  for (const m of report.matchAll(/<class name="([^"/]+)"/g)) {
    if (!/^App\.(Domain|Application)(\.|$)/.test(m[1])) {
      errors.push(`${REPORT}: class "${m[1]}" is outside the gated namespaces — the Include filter widened; re-run pnpm test:unit after fixing ${CONFIG}`);
    }
  }
}

gateResult(
  "coverage",
  `coverage:policy: core Threshold reads 100 over line/branch/method, ${ALLOWED_EXCLUSIONS.size} exclusion kind(s), each with its reason`,
  errors,
);

import { existsSync } from "node:fs";
import { read } from "./lib.mjs";
import { gateResult } from "./config.mjs";

// @adr 003 - the coverage configuration is part of the contract, not a knob
//
// 100% coverage is only meaningful while two doors stay shut: nobody lowers a
// threshold, and nobody adds an exclusion. A hook blocks both locally, but hooks do
// not run in CI — this gate is the same promise where it counts. coverage.py has no
// per-glob thresholds, so the contract is stated the other way around: the measured
// set is scoped by the `omit` allow-list below (every entry with its stated reason
// on the line above), `fail_under` must read 100 — and 100 in aggregate IS 100 on
// every measured file. When a coverage.json from test:unit is present, the per-file
// claim is additionally re-proved over the gated trees.

const CONFIG = "pyproject.toml";

/** entry -> the reason its comment must state. Adding a kind of exclusion means editing
 *  this list, which means editing a gate, which is an ADR-visible act. */
const ALLOWED_EXCLUSIONS = new Map([
  ["*/__fixtures__/*", /not product code/],
  ["src/app/main.py", /bootstrap entry/],
  ["src/app/harness/*", /scenario catalogue/],
  ["src/app/e2e/*", /conformance run/],
  // The real-Postgres adapter is the integration tier: proven by tests/integration
  // against Testcontainers Postgres (CI-mandatory), because Python has no in-process
  // engine — the BRS §15/§19 per-stack escape, decided in ADR 003/022.
  ["src/app/adapters/outbound/persistence/*", /integration tier/],
]);

/** The trees the 100% claim covers; the coverage.json half re-proves them per file. */
const GATED_TREES = [
  "src/app/domain/",
  "src/app/application/",
  "src/app/adapters/inbound/",
  "src/app/platform/",
  "src/app/config/",
];

const errors = [];
if (!existsSync(CONFIG)) {
  errors.push(`${CONFIG} is missing — nothing defines the coverage contract`);
  gateResult("coverage", "coverage:policy", errors);
}

const src = read(CONFIG);

// --- the floor: fail_under reads 100 -------------------------------------------
const reportBlock = /\[tool\.coverage\.report\]([\s\S]*?)(?=\n\[|$)/.exec(src)?.[1];
if (reportBlock === undefined) {
  errors.push(`${CONFIG}: no [tool.coverage.report] block — the floor is gone entirely`);
} else {
  const failUnder = /fail_under\s*=\s*(\d+(?:\.\d+)?)/.exec(reportBlock);
  if (failUnder === null) {
    errors.push(`${CONFIG}: [tool.coverage.report] defines no fail_under — the floor is gone entirely`);
  } else if (Number(failUnder[1]) !== 100) {
    errors.push(
      `${CONFIG}: fail_under is ${failUnder[1]} — the floor is 100 everywhere; ` +
        `an unreachable line is a design problem, not a threshold problem`,
    );
  }
  // exclude_lines replaces coverage.py's built-in "pragma: no cover" default with
  // an arbitrary list — a second door next to `omit` that this gate keeps shut.
  if (/exclude_lines\s*=/.test(reportBlock)) {
    errors.push(
      `${CONFIG}: [tool.coverage.report] declares exclude_lines — reasoned ignores are ` +
        `"pragma: no cover" comments policed by the ignores gate, never a config-wide pattern`,
    );
  }
}

// --- the measured set: branch coverage over src/app ----------------------------
const runBlock = /\[tool\.coverage\.run\]([\s\S]*?)(?=\n\[|$)/.exec(src)?.[1] ?? "";
if (!/branch\s*=\s*true/.test(runBlock)) {
  errors.push(`${CONFIG}: [tool.coverage.run] does not set branch = true — half the floor is missing`);
}
if (!/source\s*=\s*\[\s*"src\/app"\s*\]/.test(runBlock)) {
  errors.push(`${CONFIG}: [tool.coverage.run] source must be exactly ["src/app"] — the measured set is the contract`);
}

// --- exclusions: exactly the allow-list, each with its reason ------------------
// Anchored on the closing bracket ON ITS OWN LINE (`\n]`), never on the first "]"
// in the stream: a glob containing a character class (`src/app/[a-z]*/*`) would
// otherwise truncate the block and every entry after it would silently escape the
// allow-list — a tamper-guard that can be blinded by the tamper it guards against.
const omitBlock = /omit\s*=\s*\[([\s\S]*?)\n\s*\]/.exec(runBlock)?.[1];
if (omitBlock === undefined) {
  errors.push(`${CONFIG}: no coverage omit block found`);
} else {
  const lines = omitBlock.split("\n");
  let lastComment = "";
  const seen = [];
  for (const line of lines) {
    const comment = /^\s*#\s*(.+)$/.exec(line);
    if (comment !== null) {
      lastComment += ` ${comment[1]}`;
      continue;
    }
    const entry = /^\s*"([^"]+)",?\s*$/.exec(line);
    if (entry === null) continue;
    seen.push(entry[1]);
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
  if (seen.length === 0) errors.push(`${CONFIG}: the omit block lists nothing — parsing failed?`);
}

// --- the per-file half: re-prove 100 over the gated trees when a report exists --
// test:unit writes coverage/coverage.json; in `verify` this gate runs before it,
// so a stale or absent report is not a failure here — the run itself enforces
// fail_under=100. When the report IS present, the per-file claim gets re-proved.
const REPORT = "coverage/coverage.json";
if (existsSync(REPORT)) {
  const report = JSON.parse(read(REPORT));
  for (const [file, data] of Object.entries(report.files ?? {})) {
    if (!GATED_TREES.some((tree) => file.startsWith(tree))) continue;
    const missedLines = data.summary?.missing_lines ?? 0;
    const missedBranches = data.summary?.missing_branches ?? 0;
    if (missedLines > 0 || missedBranches > 0) {
      errors.push(
        `${REPORT}: ${file} misses ${missedLines} line(s) and ${missedBranches} branch(es) — ` +
          `the floor is 100 on every gated file`,
      );
    }
  }
}

gateResult(
  "coverage",
  `coverage:policy: fail_under reads 100, ${ALLOWED_EXCLUSIONS.size} exclusion kinds, each with its reason`,
  errors,
);

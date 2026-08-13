import { existsSync } from "node:fs";
import { walk, read, isProd } from "./lib.mjs";
import { gateResult } from "./config.mjs";
import { CASES_FILE } from "./docs-lib.mjs";

// @adr 003 - a coverage ignore is a claim, and a claim names its evidence
//
// The population of `jacoco ignore` markers is currently ZERO — the behavioural
// core hits its 1.00 floors without exemptions, the web adapter is exercised via
// MockMvc and the persistence adapter against a real Postgres in the native tier.
// This gate is what keeps that from eroding one "harmless" ignore at a time. In
// this stack an exclusion physically lands in build.gradle.kts (guarded by
// coverage:policy's allow-list); the marker below is the evidence record that
// must sit at the excluded declaration:
//
//   1. an ignore must state a reason of substance AND name the harness case that
//      covers the ignored branch in the e2e conformance run: `[covered-by: <case-id>]`
//   2. the named case must exist in src/test/java/app/harness/HarnessCases.java
//   3. the TOTAL count is pinned in .proto-forge/snapshot.json — growing it is a
//      visible, committed change, never a drive-by
//
// The format, exactly:
//   // jacoco ignore next -- <why unit tests cannot reach this> [covered-by: <case-id>]

const IGNORE = /jacoco ignore[^\n]*/g;
const WELL_FORMED = /jacoco ignore [^-\n]+--\s*(.{15,}?)\s*\[covered-by:\s*([a-z0-9-]+)\]/;

const errors = [];
const files = walk("src", isProd);

const caseIds = new Set(
  existsSync(CASES_FILE) ? [...read(CASES_FILE).matchAll(/new HarnessCase\(\s*"([^"]+)"/g)].map((m) => m[1]) : [],
);

let count = 0;
for (const file of files) {
  const src = read(file);
  for (const m of src.matchAll(IGNORE)) {
    count += 1;
    const parsed = WELL_FORMED.exec(m[0]);
    if (parsed === null) {
      errors.push(
        `${file}: "${m[0].trim()}" — an ignore states its reason and names its e2e ` +
          `evidence: // jacoco ignore next -- <reason> [covered-by: <case-id>]`,
      );
      continue;
    }
    if (!caseIds.has(parsed[2])) {
      errors.push(
        `${file}: covered-by names "${parsed[2]}", which ${CASES_FILE} does not declare — ` +
          `evidence that does not exist is not evidence`,
      );
    }
  }
}

// The pin. snapshot.json records how many ignores the committed tree carries; a new
// one shows up as a snapshot diff in review, not as a silent statistic.
const SNAPSHOT = ".proto-forge/snapshot.json";
if (!existsSync(SNAPSHOT)) {
  errors.push(`${SNAPSHOT} is missing — the ignore count has no committed baseline`);
} else {
  const pinned = JSON.parse(read(SNAPSHOT)).ignores;
  if (typeof pinned !== "number") {
    errors.push(`${SNAPSHOT} records no "ignores" count — run: pnpm snapshot`);
  } else if (pinned !== count) {
    errors.push(
      `the tree carries ${count} coverage ignore(s) but the committed snapshot pins ${pinned} — ` +
        `a changed population is a reviewed change: pnpm snapshot, and commit the diff`,
    );
  }
}

gateResult("ignores", `ignore-registry: ${count} coverage ignore(s), each reasoned, evidenced and pinned`, errors);

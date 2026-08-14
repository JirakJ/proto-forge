import { existsSync } from "node:fs";
import { read } from "./lib.mjs";
import { gateResult } from "./config.mjs";

// @adr 003 - the coverage configuration is part of the contract, not a knob
//
// 100% on the behavioural core is only meaningful while two doors stay shut:
// nobody lowers a JaCoCo minimum, and nobody adds an exclusion. A hook blocks
// both locally, but hooks do not run in CI — this gate is the same promise where
// it counts. The verification rule must keep covering app.domain + app.application
// per package with every minimum at 1.00, and every classDirectories exclusion
// must be on the allow-list below WITH its stated reason on the line above, so
// the exclude list stays a record instead of becoming a dumping ground.

const CONFIG = "build.gradle.kts";

/** entry -> the reason its comment must state. Adding a kind of exclusion means editing
 *  this list, which means editing a gate, which is an ADR-visible act. */
const ALLOWED_EXCLUSIONS = new Map([
  ["app/MainKt*", /composition root|bootstrap entr/],
  ["app/MigrateMainKt*", /bootstrap entr|operator migration/],
  ["app/WiringKt*", /composition root|bootstrap entr/],
  // No entry for compiler-generated serialization plumbing: the domain's wire
  // schemas are hand-written serializers (ADR 003), so there is no generated
  // decoder to exclude — the exception this list would otherwise have carried is
  // absent by construction, which is the better kind of absent. Repository ports
  // are pure interfaces with zero executable instructions and JaCoCo skips them;
  // tests, fixtures and the harness live in src/test, which JaCoCo never counts.
]);

const errors = [];
if (!existsSync(CONFIG)) {
  errors.push(`${CONFIG} is missing — nothing defines the coverage contract`);
  gateResult("coverage", "coverage:policy", errors);
}

const src = read(CONFIG);

// --- the verification rule: domain + application per package, every minimum 1.00
const rulesBlock = /violationRules\s*\{([\s\S]*?)\n\s{4}\}/.exec(src)?.[1];
if (rulesBlock === undefined) {
  errors.push(`${CONFIG}: no jacocoTestCoverageVerification violationRules block — the floors are gone entirely`);
} else {
  const REQUIRED_PACKAGES = [
    '"app.domain"',
    '"app.domain.*"',
    '"app.application"',
    '"app.application.*"',
    // app.config earned its place by reaching 1.00 unaided; widening a floor is
    // tightening, which needs no waiver — narrowing it back is what this gate stops.
    '"app.config"',
    '"app.config.*"',
  ];
  for (const pkg of REQUIRED_PACKAGES) {
    if (!rulesBlock.includes(pkg)) {
      errors.push(`${CONFIG}: violationRules no longer include ${pkg} — the behavioural core lost its floor`);
    }
  }
  const minimums = [...rulesBlock.matchAll(/minimum\s*=\s*"([\d.]+)"/g)];
  if (minimums.length === 0) {
    errors.push(`${CONFIG}: violationRules carry no minimum — parsing failed, or the limits are gone`);
  }
  for (const m of minimums) {
    if (Number(m[1]) !== 1) {
      errors.push(
        `${CONFIG}: a coverage minimum is ${m[1]} — the floor is 1.00 everywhere; ` +
          `an unreachable line is a design problem, not a threshold problem`,
      );
    }
  }
  for (const counter of ["INSTRUCTION", "BRANCH", "LINE"]) {
    if (!rulesBlock.includes(`"${counter}"`)) {
      errors.push(`${CONFIG}: the ${counter} counter lost its limit — all three counters hold the floor`);
    }
  }
}

// --- exclusions: exactly the allow-list, each with its reason ------------------
// Anchored on the closing parenthesis on its own line, never on the first ")" in
// the stream, so an entry containing parentheses cannot truncate the block and
// let every entry after it silently escape the allow-list — a tamper-guard that
// can be blinded by the tamper it guards against is no guard.
const excludeBlock = /exclude\(([\s\S]*?)\n\s*\)/.exec(src)?.[1];
if (excludeBlock === undefined) {
  errors.push(`${CONFIG}: no classDirectories exclude block found`);
} else {
  const lines = excludeBlock.split("\n");
  let lastComment = "";
  const seen = [];
  for (const line of lines) {
    const comment = /^\s*\/\/\s*(.+)$/.exec(line);
    if (comment !== null) {
      lastComment = `${lastComment} ${comment[1]}`.trim();
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
  }
  if (seen.length === 0) errors.push(`${CONFIG}: the exclude block lists nothing — parsing failed?`);
}

gateResult(
  "coverage",
  `coverage:policy: domain+application per-package floors read 1.00, ${ALLOWED_EXCLUSIONS.size} exclusion kinds, each with its reason`,
  errors,
);

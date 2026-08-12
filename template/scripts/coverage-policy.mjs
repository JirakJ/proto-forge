import { existsSync } from "node:fs";
import { read } from "./lib.mjs";
import { gateResult } from "./config.mjs";

// @adr 003 - the coverage configuration is part of the contract, not a knob
//
// 100% coverage is only meaningful while two doors stay shut: nobody lowers a
// threshold, and nobody adds an exclusion. A hook blocks both locally, but hooks do
// not run in CI — this gate is the same promise where it counts. Every threshold must
// read 100, and every exclusion must be on the allow-list below WITH its stated
// reason on the line above, so the exclude list stays a record instead of becoming a
// dumping ground.

const CONFIG = "vite.config.ts";

/** entry -> the reason its comment must state. Adding a kind of exclusion means editing
 *  this list, which means editing a gate, which is an ADR-visible act. */
const ALLOWED_EXCLUSIONS = new Map([
  ["**/*.test.*", /not product code/],
  ["**/*.e2e.*", /not product code/],
  ["**/__fixtures__/**", /not product code/],
  ["src/test/**", /test infrastructure/],
  ["src/main.tsx", /bootstrap entry/],
  ["src/harness/**", /fixture catalogue/],
  ["src/i18n/resources.d.ts", /declarations/],
  ["**/*.d.ts", /declarations/],
  // No entry for repository ports: a pure-interface module has zero executable
  // statements, and v8 passes 0/0 vacuously — an exclusion would record a need that
  // does not exist.
]);

const errors = [];
if (!existsSync(CONFIG)) {
  errors.push(`${CONFIG} is missing — nothing defines the coverage contract`);
  gateResult("coverage", "coverage:policy", errors);
}

const src = read(CONFIG);

// --- thresholds: every number in the thresholds block is 100 -------------------
const thresholdsBlock = /thresholds:\s*\{([\s\S]*?)\n\s*\},/.exec(src)?.[1];
if (thresholdsBlock === undefined) {
  errors.push(`${CONFIG}: no coverage.thresholds block — the floors are gone entirely`);
} else {
  for (const m of thresholdsBlock.matchAll(/(statements|branches|functions|lines):\s*(\d+)/g)) {
    if (Number(m[2]) !== 100) {
      errors.push(
        `${CONFIG}: ${m[1]} threshold is ${m[2]} — the floor is 100 everywhere; ` +
          `an unreachable line is a design problem, not a threshold problem`,
      );
    }
  }
  if (![...thresholdsBlock.matchAll(/statements/g)].length) {
    errors.push(`${CONFIG}: thresholds block defines no statement floors`);
  }
}

// --- exclusions: exactly the allow-list, each with its reason ------------------
const excludeBlock = /exclude:\s*\[([\s\S]*?)\]/.exec(src)?.[1];
if (excludeBlock === undefined) {
  errors.push(`${CONFIG}: no coverage.exclude block found`);
} else {
  const lines = excludeBlock.split("\n");
  let lastComment = "";
  const seen = [];
  for (const line of lines) {
    const comment = /^\s*\/\/\s*(.+)$/.exec(line);
    if (comment !== null) {
      lastComment = comment[1];
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
  `coverage:policy: every floor reads 100, ${ALLOWED_EXCLUSIONS.size} exclusion kinds, each with its reason`,
  errors,
);

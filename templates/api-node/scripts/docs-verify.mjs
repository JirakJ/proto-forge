import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { read } from "./lib.mjs";
import { gateResult } from "./config.mjs";
import {
  adrDigests,
  anchoredAdrs,
  operationIds,
  docFor,
  examplesDirFor,
  handlerSourceHash,
  readExamplesLock,
  EXAMPLES_LOCK,
} from "./docs-lib.mjs";

// @adr 009 - an endpoint is not finished until its docs carry a current captured example (BR-26)
//
// This is the web template's screenshot discipline with the artefact swapped: a
// picture of an API is a captured exchange. Every operationId (plus the problem
// catalogue) has a real page under docs/api/; every operation shows a captured
// request/response example produced by `pnpm docs:examples` running the app
// against the harness scenarios; and the lock hashes the handler sources — so an
// example captured from OLDER code fails rather than flattering. A missing
// example needs an explicit <!-- no-example: reason --> with a reason of substance.

const STUB = /^#\s*\w+\s*$|TODO|TBD|coming soon/im;
const NO_EXAMPLE = /<!--\s*no-example:\s*(.{10,}?)\s*-->/;
const MIN_CHARS = 200;

const errors = [];
const ops = operationIds();
const subjects = [...new Set(ops.map((o) => o.id))];

// --- every subject has a real page --------------------------------------------
for (const subject of [...subjects, "problems"]) {
  const doc = docFor(subject);
  if (!existsSync(doc)) {
    errors.push(`${doc} is missing — ${subject === "problems" ? "the problem catalogue" : `operation ${subject}`} is undocumented`);
    continue;
  }
  const body = read(doc);
  if (body.replace(/\s+/g, " ").length < MIN_CHARS) {
    errors.push(`${doc}: under ${MIN_CHARS} characters — a title and a shrug is not documentation`);
  }
  if (STUB.test(body)) errors.push(`${doc}: reads as a stub (TODO/TBD marker or bare heading)`);
}

// --- captured examples, current ones ------------------------------------------
const lock = readExamplesLock();

for (const subject of subjects) {
  const doc = docFor(subject);
  if (!existsSync(doc)) continue; // already reported above
  const dir = examplesDirFor(subject);
  const captured = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".json")) : [];

  if (captured.length === 0) {
    const declared = NO_EXAMPLE.exec(read(doc));
    if (declared === null) {
      errors.push(
        `${doc}: no captured example and no stated reason — run pnpm docs:examples, ` +
          `or state <!-- no-example: <reason> --> if there is genuinely nothing to capture`,
      );
    }
    continue;
  }

  if (lock === null) {
    errors.push(`${EXAMPLES_LOCK} is missing but ${dir} has captures — run pnpm docs:examples so the lock records their source`);
    continue;
  }
  for (const file of captured) {
    if (!(lock.captured ?? []).includes(join(dir, file))) {
      errors.push(`${join(dir, file)}: not listed in ${EXAMPLES_LOCK} — a capture the lock does not know is a capture nothing keeps fresh`);
    }
  }
}

// --- the freshness half: editing a handler invalidates the captures -----------
if (lock !== null) {
  const actual = handlerSourceHash();
  if (lock.source !== actual) {
    errors.push(
      `${EXAMPLES_LOCK}: examples are stale — the handler sources changed since the capture ` +
        `(a handler edit invalidates its example until docs:examples reruns); run pnpm docs:examples`,
    );
  }
}

// --- BR-42: the pages were written against decisions that still stand ---------
// The handler hash above cannot see this. Change an ADR's decision and leave the
// handlers alone and it still matches — the pages now document endpoints built on
// a decision nobody holds. Re-locking runs docs:examples, which re-captures at the
// same time, so refreshing the exchanges is the mechanism rather than a second rule.
const anchored = anchoredAdrs();
if (anchored.length > 0) {
  if (lock === null) {
    errors.push(
      `${EXAMPLES_LOCK} is missing — the handlers implement ADR ${anchored.join(", ")} and nothing records ` +
        `which version of ${anchored.length === 1 ? "that decision" : "those decisions"} the pages were written ` +
        `against; run pnpm docs:examples`,
    );
  } else {
    const current = adrDigests(anchored);
    const moved = anchored.filter((n) => (lock.adrs ?? {})[n] !== current[n]);
    if (moved.length > 0) {
      errors.push(
        `docs/api was written against an older ADR ${moved.join(", ")} — the decision changed and the ` +
          `documentation did not. Re-read the pages against ${moved.length === 1 ? "it" : "them"}, then ` +
          `re-run pnpm docs:examples.`,
      );
    }
  }
}

// The docs gate has no option toggles on purpose: BR-26 is all-or-nothing, and
// the only relaxation path is the gate's waiver-backed mode like any other.
gateResult("docs", `docs:verify: ${subjects.length} operation(s) + problems documented, captured examples current`, errors);

import { existsSync } from "node:fs";
import { join } from "node:path";
import { read } from "./lib.mjs";
import { gateOptions, gateResult } from "./config.mjs";
import {
  CASES_FILE,
  adrDigests,
  anchoredAdrs,
  componentSources,
  docFor,
  documentableComponents,
  featureSources,
  features,
  lockFor,
  sourceHash,
} from "./docs-lib.mjs";

// @adr 009 - a component is not done until it is documented and photographed
// Building the component, writing its docs and capturing its states are one task,
// not three, so the gate treats them as one. Three things are checked, in the
// order they tend to rot:
//   1. the page exists at all
//   2. it actually shows the component (a screenshot, or a stated reason there
//      cannot be one — a Portal has nothing to photograph)
//   3. the screenshot is of TODAY's code, not of the version it looked good in
// (3) is why the lock records a source hash. Without it, docs stay green forever
// while the pictures quietly become fiction.

const opts = gateOptions("docs");
const errors = [];
const NO_SHOT = /<!--\s*no-screenshot:\s*(.{10,}?)\s*-->/;
const IMAGE = /!\[[^\]]*\]\(([^)]+\.png)\)/g;

function checkSubject(kind, name, sources) {
  const doc = docFor(kind, name);
  if (!existsSync(doc)) {
    errors.push(`${doc} is missing — documenting ${name} is part of building it, not a follow-up`);
    return;
  }

  const body = read(doc);
  if (body.trim().length < 200) {
    errors.push(`${doc} is a stub (${body.trim().length} chars) — describe the API, the a11y contract and the i18n keys`);
  }

  const images = [...body.matchAll(IMAGE)].map((m) => m[1]);
  const exempt = NO_SHOT.exec(body);

  if (!opts.requireScreenshots) return;

  if (images.length === 0) {
    if (exempt === null) {
      errors.push(
        `${doc} shows no screenshot — add one via \`pnpm docs:shots\`, or state why there cannot be one ` +
          `with <!-- no-screenshot: reason -->`,
      );
    }
    return;
  }

  for (const rel of images) {
    const onDisk = join("docs", kind, name, rel.replace(/^\.\//, ""));
    if (!existsSync(onDisk)) errors.push(`${doc} references ${rel}, which does not exist — run pnpm docs:shots`);
  }

  if (!opts.requireFreshScreenshots) return;

  const lock = lockFor(kind, name);
  if (!existsSync(lock)) {
    errors.push(`${lock} is missing — screenshots exist but nothing records which code they show; run pnpm docs:shots`);
    return;
  }
  if (sources.length === 0) return; // nothing to hash against; the doc still has to exist
  const recorded = JSON.parse(read(lock)).source;
  if (recorded !== sourceHash(sources)) {
    errors.push(
      `${name}: the screenshots were taken from an older ${sources.length === 1 ? "version of " : ""}` +
        `${sources.join(", ")}${existsSync(CASES_FILE) ? " (or harness case)" : ""} — re-run pnpm docs:shots`,
    );
  }
}

// --- BR-42: the page was written against a decision that still stands -----------
// The source hash above cannot see this. Change an ADR's decision and leave the
// code alone and every hash still matches — the page now describes code that
// implements a decision nobody holds. So the lock also records the ADRs the
// subject anchors, and a decision that moved since the page was written is a
// finding that NAMES the ADR rather than muttering about screenshots.
//
// Re-locking runs `pnpm docs:shots`, which re-photographs at the same time, so
// "update the images too" is the mechanism rather than a second rule.
function checkDecisions(kind, name, sources) {
  if (!opts.requireFreshScreenshots) return;
  const anchored = anchoredAdrs(sources);
  if (anchored.length === 0) return; // nothing claims to implement a decision here

  const lock = lockFor(kind, name);
  if (!existsSync(lock)) {
    errors.push(
      `${lock} is missing — ${name} implements ADR ${anchored.join(", ")} and nothing records which version of ` +
        `${anchored.length === 1 ? "that decision" : "those decisions"} its page was written against; run pnpm docs:shots`,
    );
    return;
  }

  const recorded = JSON.parse(read(lock)).adrs ?? {};
  const current = adrDigests(anchored);
  const moved = anchored.filter((n) => recorded[n] !== current[n]);
  if (moved.length > 0) {
    errors.push(
      `${docFor(kind, name)} was written against an older ADR ${moved.join(", ")} — the decision changed and the ` +
        `documentation did not. Re-read the page against ${moved.length === 1 ? "it" : "them"}, then re-run pnpm docs:shots.`,
    );
  }
}

for (const component of documentableComponents()) {
  const sources = componentSources(component);
  checkSubject("components", component, sources);
  checkDecisions("components", component, sources);
}
for (const feature of features()) {
  const sources = featureSources(feature);
  checkSubject("features", feature, sources);
  checkDecisions("features", feature, sources);
}

// Every harness case should end up in someone's documentation; a case that
// photographs nothing is dead weight in the catalogue.
if (existsSync(CASES_FILE)) {
  const declared = [...read(CASES_FILE).matchAll(/component:\s*["'](\w+)["']/g)].map((m) => m[1]);
  const documented = new Set(documentableComponents());
  for (const c of new Set(declared)) {
    if (!documented.has(c)) errors.push(`${CASES_FILE}: case for "${c}", which @jj/proto-ui does not export`);
  }
}

const subjects = documentableComponents().length + features().length;
gateResult("docs", `docs:verify: ${subjects} documented subjects, screenshots present and current`, errors);

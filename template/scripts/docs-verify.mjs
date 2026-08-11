import { existsSync } from "node:fs";
import { join } from "node:path";
import { read } from "./lib.mjs";
import { gateOptions, gateResult } from "./config.mjs";
import {
  CASES_FILE,
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
        `${sources.join(", ")}${existsSync(CASES_FILE) ? " (or gallery case)" : ""} — re-run pnpm docs:shots`,
    );
  }
}

for (const component of documentableComponents()) {
  checkSubject("components", component, componentSources(component));
}
for (const feature of features()) {
  checkSubject("features", feature, featureSources(feature));
}

// Every gallery case should end up in someone's documentation; a case that
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

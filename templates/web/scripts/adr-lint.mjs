import { existsSync } from "node:fs";
import { walk, read, isProd, fail, ok } from "./lib.mjs";

// BR-05: @adr anchors in PRODUCTION code resolve to accepted ADRs; every accepted
// code-ADR (>=010) is anchored >=1x; each accepted ADR back-references a real
// .prompts/NNNN-slug.md entry; coverage-waiver markers resolve to an accepted ADR.
//
// Scope widening (deliberate, matching api-node's adr-lint): anchors are scanned
// in src/** and packages/** production code AND in scripts/*.mjs and deploy/*.mjs
// headers. The delivery decisions (ADRs 200-202) are implemented in the gate
// corpus and the smoke script — an anchor that cannot live where the decision is
// implemented would be a lie told to satisfy a linter. The selftest is excluded:
// its fixture strings are deliberate COUNTEREXAMPLES (@adr numbers that must not
// resolve), not anchors.
const PROMPT_REF = /^\.prompts\/\d{4}-[a-z0-9-]+\.md$/;

const adrs = walk("docs/adr", (p) => p.endsWith(".md")).map((p) => {
  const b = read(p);
  const numRaw = p.match(/\/(\d+)-/)?.[1];
  return {
    p,
    num: numRaw === undefined ? NaN : Number(numRaw),
    status: (b.match(/- Status:\s*(\w+)/)?.[1] ?? "unknown").toLowerCase(),
    title: b.match(/# ADR \d+:\s*(.+)/)?.[1] ?? "",
    promptLog: b.match(/- Prompt-log:\s*(\S+)/)?.[1],
  };
});
const byNum = new Map(adrs.map((a) => [a.num, a]));
const errors = [];

// Two files sharing a number would silently shadow each other in the Map above, and a
// generator allocating "the low end of the band" next to a pre-written ADR is exactly
// how that happens. Duplicates are an error, not a last-write-wins.
const numbered = new Map();
for (const a of adrs) {
  if (Number.isNaN(a.num)) continue;
  const previous = numbered.get(a.num);
  if (previous !== undefined) errors.push(`ADR number ${a.num} is used twice: ${previous} and ${a.p}`);
  numbered.set(a.num, a.p);
}

for (const a of adrs) {
  if (Number.isNaN(a.num)) errors.push(`${a.p}: filename has no NNN- prefix`);
  if (!["proposed", "accepted", "superseded"].includes(a.status)) errors.push(`${a.p}: unrecognized status "${a.status}"`);
}

// Anchors are only credible in production source (not tests/stories) — plus the
// gate corpus and deploy scripts, per the scope note above.
const codeFiles = [
  ...walk("src", isProd),
  ...walk("packages", isProd),
  ...walk("scripts", (p) => p.endsWith(".mjs") && !p.endsWith("gates-selftest.mjs")),
  ...walk("deploy", (p) => p.endsWith(".mjs")),
];
const anchored = new Set();
for (const f of codeFiles) {
  const b = read(f);
  for (const m of b.matchAll(/\/\/\s*@adr\s+(\d+)\s*-\s*.+/g)) {
    const n = Number(m[1]);
    anchored.add(n);
    const adr = byNum.get(n);
    if (!adr) errors.push(`${f}: @adr ${n} has no ADR file`);
    else if (adr.status !== "accepted") errors.push(`${f}: @adr ${n} references a ${adr.status} ADR`);
  }
  for (const m of b.matchAll(/coverage-waiver:\s*ADR-(\d+)/g)) {
    const adr = byNum.get(Number(m[1]));
    if (!adr || adr.status !== "accepted") errors.push(`${f}: coverage-waiver ADR-${m[1]} is not accepted`);
  }
}

for (const a of adrs) {
  if (a.status !== "accepted") continue;
  if (a.num >= 10 && !anchored.has(a.num)) errors.push(`ADR ${a.num} (${a.title}) accepted but never anchored in production code`);
  if (!a.promptLog) errors.push(`ADR ${a.num} missing Prompt-log back-reference`);
  else if (!PROMPT_REF.test(a.promptLog)) errors.push(`ADR ${a.num} Prompt-log "${a.promptLog}" must be a .prompts/NNNN-slug.md path`);
  else if (!existsSync(a.promptLog)) errors.push(`ADR ${a.num} Prompt-log ${a.promptLog} does not exist`);
}

if (errors.length) fail("adr-lint FAILED", errors);
ok(`adr-lint: ${adrs.length} ADRs, ${anchored.size} anchored (prod + gate corpus), links intact`);

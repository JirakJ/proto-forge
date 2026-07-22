import { existsSync } from "node:fs";
import { walk, read, isProd, fail, ok } from "./lib.mjs";

// BR-05: @adr anchors in PRODUCTION code resolve to accepted ADRs; every accepted
// code-ADR (>=010) is anchored >=1x; each accepted ADR back-references a real
// .prompts/NNNN-slug.md entry; coverage-waiver markers resolve to an accepted ADR.
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

for (const a of adrs) {
  if (Number.isNaN(a.num)) errors.push(`${a.p}: filename has no NNN- prefix`);
  if (!["proposed", "accepted", "superseded"].includes(a.status)) errors.push(`${a.p}: unrecognized status "${a.status}"`);
}

// Anchors are only credible in production source (not tests/stories).
const codeFiles = [...walk("src", isProd), ...walk("packages", isProd)];
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
ok(`adr-lint: ${adrs.length} ADRs, ${anchored.size} anchored (prod), links intact`);

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { read, fail, ok } from "./lib.mjs";
import {
  QUALITY_FILE,
  STATUS_DOC,
  STATUS_BEGIN,
  STATUS_END,
  MANIFEST,
  verifyChain,
  partCounts,
  renderStatusBlock,
} from "./quality-lib.mjs";

// @adr 001 - quality:report, the producer half of the status pair (BR-36)
//
// Support tool, wired into verify right before status:verify. The workspace's
// facts are the manifest's part declarations, what is materialized on this
// machine, and the verify chain — derived from the committed tree rather than
// from tier reports, distilled into .proto-forge/quality.json (no timestamps:
// freshness is the bond to this run), and rendered into the docs/STATUS.md
// block between the quality markers. A missing manifest is a hard failure: a
// source that vanished is a silently weakened doc, not a shrug.
//
// `--summary` prints the current quality.json as markdown to stdout (the CI
// step appends it to $GITHUB_STEP_SUMMARY) and never fails: after a red verify
// there may legitimately be nothing to summarise yet.

if (process.argv.includes("--summary")) {
  process.stdout.write("## quality\n\n");
  if (!existsSync(QUALITY_FILE)) {
    process.stdout.write(`no ${QUALITY_FILE} — the verify run ended before quality:report\n`);
  } else {
    process.stdout.write(`${renderStatusBlock(JSON.parse(read(QUALITY_FILE)))}\n`);
  }
  process.exit(0);
}

const parts = partCounts();
if (parts === null) fail(`quality:report — ${MANIFEST} is missing or unreadable (a source that vanished is a silently weakened doc)`);

const chain = verifyChain();

// Key order is fixed and the file ends in one newline: the same facts must
// serialise to the same bytes, or the status gate's byte-compare means nothing.
const quality = {
  parts,
  gates: { count: chain.length, chain },
};

mkdirSync(dirname(QUALITY_FILE), { recursive: true });
writeFileSync(QUALITY_FILE, JSON.stringify(quality, null, 2) + "\n");

if (!existsSync(STATUS_DOC)) {
  fail(`quality:report — ${STATUS_DOC} is missing; the standing document is part of the template`);
}
const body = read(STATUS_DOC);
const begin = body.indexOf(STATUS_BEGIN);
const end = body.indexOf(STATUS_END);
if (begin === -1 || end === -1 || end < begin) {
  fail(`quality:report — the ${STATUS_BEGIN} … ${STATUS_END} markers are missing from ${STATUS_DOC}`);
}
const next = `${body.slice(0, begin + STATUS_BEGIN.length)}\n${renderStatusBlock(quality)}\n${body.slice(end)}`;
if (next !== body) writeFileSync(STATUS_DOC, next);

ok(
  `quality:report: ${quality.parts.present}/${quality.parts.declared} part(s) present, ` +
    `${quality.gates.count} gates → ${QUALITY_FILE} + ${STATUS_DOC}`,
);

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { read, fail, ok } from "./lib.mjs";
import {
  QUALITY_FILE,
  STATUS_DOC,
  STATUS_BEGIN,
  STATUS_END,
  FLOWS,
  CONTRACT_CASES,
  verifyChain,
  caseCount,
  renderStatusBlock,
} from "./quality-lib.mjs";

// @adr 001 - quality:report, the producer half of the status pair (BR-36)
//
// Support tool, wired into verify right before status:verify. This template's
// facts are static — the registry case counts and the verify chain — so the
// producer derives them from the committed tree rather than from tier reports,
// distils them into .proto-forge/quality.json (no timestamps: freshness is the
// bond to this run), and regenerates the docs/STATUS.md block between the
// quality markers. A missing registry is a hard failure: a source that
// vanished is a silently weakened doc, not a shrug.
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

const flows = caseCount(FLOWS, "flowCases");
const contractCases = caseCount(CONTRACT_CASES, "contractCases");
if (flows === null) fail(`quality:report — ${FLOWS} is missing or does not export flowCases (a source that vanished is a silently weakened doc)`);
if (contractCases === null) fail(`quality:report — ${CONTRACT_CASES} is missing or does not export contractCases`);

const chain = verifyChain();

// Key order is fixed and the file ends in one newline: the same facts must
// serialise to the same bytes, or the status gate's byte-compare means nothing.
const quality = {
  static: { flows, contractCases },
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
  `quality:report: ${quality.static.flows} flow case(s) + ${quality.static.contractCases} contract case(s), ` +
    `${quality.gates.count} gates → ${QUALITY_FILE} + ${STATUS_DOC}`,
);

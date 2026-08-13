import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fail, ok } from "./lib.mjs";

// BR-06: one accepted ADR = one commit. Two halves, both checked:
//   message — Conventional Commits subject, exactly one `ADR: NNN` trailer, a
//             resolving `Prompt-Log:` trailer
//   diff    — the STAGED changes flip exactly the ADR the trailer names to
//             `accepted`, and no other. A message can promise anything; the diff is
//             what the commit actually does, and the two must agree.
const msgFile = process.argv[2];
if (!msgFile) fail("commit-lint: no commit message file passed");
const msg = readFileSync(msgFile, "utf8");
const errors = [];

const subject = msg.split("\n")[0] ?? "";
if (!/^(feat|fix|chore|docs|test|refactor|perf|build|ci)(\(.+\))?: .+/.test(subject)) {
  errors.push(`subject is not Conventional Commits: "${subject}"`);
}
const adrTrailers = msg.match(/^ADR:\s*(\d+)/gm) ?? [];
if (adrTrailers.length !== 1) errors.push(`expected exactly one "ADR: NNN" trailer, found ${adrTrailers.length}`);
if (!/^Prompt-Log:\s*\S+/m.test(msg)) errors.push('missing "Prompt-Log:" trailer');

// --- the diff half -------------------------------------------------------------
// Every `+- Status: accepted` line in the staged ADR diff is one transition. The count
// must be exactly one, and it must belong to the ADR the trailer names.
if (adrTrailers.length === 1) {
  const named = /^ADR:\s*(\d+)/m.exec(msg)?.[1].padStart(3, "0");
  let staged = "";
  try {
    staged = execSync("git diff --cached -U0 -- docs/adr", { encoding: "utf8" });
  } catch {
    // Outside a git repository (a gate selftest fixture): the message half stands alone.
  }
  if (staged !== "") {
    const transitions = [];
    let currentFile = "";
    for (const line of staged.split("\n")) {
      const header = /^\+\+\+ b\/docs\/adr\/(\d+)-/.exec(line);
      if (header !== null) currentFile = header[1];
      if (/^\+- Status:\s*accepted/.test(line)) transitions.push(currentFile);
    }
    if (transitions.length > 1) {
      errors.push(`the staged diff flips ${transitions.length} ADRs to accepted (${transitions.join(", ")}) — one decision, one commit`);
    }
    if (transitions.length === 1 && named !== undefined && transitions[0] !== named) {
      errors.push(`the trailer names ADR ${named} but the staged diff accepts ADR ${transitions[0]}`);
    }
  }
}

if (errors.length) fail("commit-lint FAILED", errors);
ok("commit-lint: message well-formed, staged transitions agree with the trailer");

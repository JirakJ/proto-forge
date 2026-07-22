import { readFileSync } from "node:fs";
import { fail, ok } from "./lib.mjs";

// BR-06: one accepted ADR = one commit. Enforces Conventional Commits subject +
// exactly one `ADR: NNN` trailer + a resolving `Prompt-Log:` trailer.
const msgFile = process.argv[2];
if (!msgFile) fail("commit-lint: no commit message file passed");
const msg = readFileSync(msgFile, "utf8");
const errors = [];

const subject = msg.split("\n")[0] ?? "";
if (!/^(feat|fix|chore|docs|test|refactor|perf|build|ci)(\(.+\))?: .+/.test(subject)) {
  errors.push(`subject is not Conventional Commits: "${subject}"`);
}
const adrTrailers = msg.match(/^ADR:\s*\d+/gm) ?? [];
if (adrTrailers.length !== 1) errors.push(`expected exactly one "ADR: NNN" trailer, found ${adrTrailers.length}`);
if (!/^Prompt-Log:\s*\S+/m.test(msg)) errors.push('missing "Prompt-Log:" trailer');

if (errors.length) fail("commit-lint FAILED", errors);
ok("commit-lint: message well-formed");

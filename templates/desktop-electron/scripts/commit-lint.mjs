import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { fail, ok } from "./lib.mjs";
import { coAuthorTrailer, frontmatter, loadModels, resolveModel } from "./models.mjs";

// BR-06: one accepted ADR = one commit. BR-46: the operator authors, the model
// co-authors. Two halves, both checked:
//   message — Conventional Commits subject, exactly one `ADR: NNN` trailer, a
//             resolving `Prompt-Log:` trailer, and at least one well-formed
//             `Co-Authored-By: <model> <email>` trailer naming the model that
//             prepared the commit — the registered identity of the model the
//             cited prompt-log entry records (commit-coauthor derives it; this
//             half verifies it)
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

// --- authorship (BR-46) --------------------------------------------------------
// The git author is the operator who ran the prompt; the model that prepared the
// commit signs as co-author. The gate proves the trailer's presence and shape,
// that the author is not hiding behind a co-author line, and — since the prompt
// log records the model that executed each entry (BR-50) — that the trailer
// names the SAME model the cited entry records, by its registered identity.
const coAuthorLines = msg.match(/^Co-Authored-By:.*$/gim) ?? [];
const coAuthors = coAuthorLines
  .map((l) => /^Co-Authored-By:\s*(\S.*?)\s*<([^<>\s]+@[^<>\s]+)>\s*$/i.exec(l))
  .filter((m) => m !== null);
if (coAuthorLines.length === 0) {
  errors.push('missing "Co-Authored-By:" trailer — the model that prepared the commit signs as co-author (BR-46)');
} else if (coAuthors.length !== coAuthorLines.length) {
  errors.push('a "Co-Authored-By:" trailer is malformed — the shape is "Co-Authored-By: Name <email>" (BR-46)');
}
const promptRef = /^Prompt-Log:\s*(\S+)/m.exec(msg)?.[1];
if (promptRef !== undefined && existsSync(promptRef)) {
  const declared = frontmatter(readFileSync(promptRef, "utf8"))?.model;
  if (declared !== undefined) {
    const { registry, errors: registryErrors } = loadModels();
    if (registry === null) {
      errors.push(...registryErrors);
    } else {
      const model = resolveModel(registry, declared);
      if (model === undefined) {
        errors.push(`${promptRef} names model "${declared}", which .proto-forge/models.json does not list (BR-50)`);
      } else {
        const expected = coAuthorTrailer(model);
        const signed = coAuthors.some(
          (m) => m[1].toLowerCase() === model.coAuthor.name.toLowerCase() && m[2].toLowerCase() === model.coAuthor.email.toLowerCase(),
        );
        if (!signed) {
          errors.push(
            `${promptRef} records ${model.id}, but no co-author trailer signs as it — expected "${expected}" ` +
              "(the prepare-commit-msg hook derives it; a hand-typed trailer must name the same model, BR-46)",
          );
        }
      }
    }
  }
}
try {
  const ident = execSync("git var GIT_AUTHOR_IDENT", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  const authorEmail = /<([^<>]+)>/.exec(ident)?.[1]?.toLowerCase();
  if (authorEmail !== undefined && coAuthors.some((m) => m[2].toLowerCase() === authorEmail)) {
    errors.push(`the git author <${authorEmail}> also signs as co-author — the operator authors, the model co-authors; they are not the same identity (BR-46)`);
  }
} catch {
  // Outside a git repository (a gate selftest fixture): the trailer half stands alone.
}

// --- fix discipline (BR-49) ----------------------------------------------------
// A fix ships its regression test in the same commit: the defect that had no
// failing test is the defect that returns. The staged file list is the proof;
// outside a git repository the check cannot run (the selftest fixtures' state).
if (/^fix[(:]/.test(subject)) {
  let staged = null;
  try {
    staged = execSync("git diff --cached --name-only", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    // Outside a git repository: nothing to inspect.
  }
  if (staged !== null) {
    const files = staged.split("\n").filter(Boolean);
    const isTest = (f) => /\.test\.|\.e2e\.|(^|\/)e2e\/|(^|\/)tests?\//.test(f);
    if (files.length > 0 && !files.some(isTest)) {
      errors.push(
        "a fix: commit must carry its regression test — stage the test that fails before this fix and passes after it (BR-49)",
      );
    }
  }
}

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

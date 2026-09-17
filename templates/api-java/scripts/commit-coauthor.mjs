import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { coAuthorTrailer, frontmatter, loadModels, resolveModel } from "./models.mjs";

// BR-46: the operator authors, the model co-authors — and the trailer is DERIVED,
// not typed. This is the prepare-commit-msg half: when the message carries no
// Co-Authored-By trailer, the model that prepared the commit is resolved and its
// registered identity appended. commit-lint (the commit-msg half) then verifies
// that the trailer names the model the cited prompt-log entry records.
//
// Sources, in order — the first that resolves wins:
//   1. the `model:` field of the prompt-log entry the message's Prompt-Log: trailer
//      names (the entry that produced this commit; the provenance BR-46 trusts)
//   2. PROTO_FORGE_MODEL in the environment (a harness with no session record)
//   3. .proto-forge/session.json, written by the SessionStart / PostModelSwitch
//      hooks whenever Claude Code reports the model
// None resolving aborts the commit with the fix — a commit with no model is a
// commit that hides who did the work, which is what the rule exists to prevent.
//
// Arguments are git's: the message file, the source (message | template | merge |
// squash | commit) and, for amends, the sha. Merges and squashes are git's own
// messages and are left alone.

const [msgFile, source] = process.argv.slice(2);
if (!msgFile) {
  process.stderr.write("commit-coauthor: no commit message file passed\n");
  process.exit(1);
}
if (source === "merge" || source === "squash") process.exit(0);

const msg = readFileSync(msgFile, "utf8");
if (/^Co-Authored-By:/im.test(msg)) process.exit(0);

const { registry, errors } = loadModels();
if (registry === null) {
  process.stderr.write(`commit-coauthor: ${errors.join("; ")}\n`);
  process.exit(1);
}

const tried = [];
function fromPromptLog() {
  const ref = /^Prompt-Log:\s*(\S+)/m.exec(msg)?.[1];
  if (ref === undefined) {
    tried.push("the message has no Prompt-Log: trailer yet");
    return undefined;
  }
  if (!existsSync(ref)) {
    tried.push(`Prompt-Log: ${ref} does not exist`);
    return undefined;
  }
  const declared = frontmatter(readFileSync(ref, "utf8"))?.model;
  if (declared === undefined) {
    tried.push(`${ref} declares no model: field`);
    return undefined;
  }
  const model = resolveModel(registry, declared);
  if (model === undefined) tried.push(`${ref} names "${declared}", which the registry does not list`);
  return model;
}
function fromEnv() {
  const declared = process.env.PROTO_FORGE_MODEL;
  if (declared === undefined || declared.trim() === "") {
    tried.push("PROTO_FORGE_MODEL is not set");
    return undefined;
  }
  const model = resolveModel(registry, declared);
  if (model === undefined) tried.push(`PROTO_FORGE_MODEL="${declared}" is not a registered model`);
  return model;
}
function fromSession() {
  const path = ".proto-forge/session.json";
  if (!existsSync(path)) {
    tried.push(`${path} is absent (no SessionStart hook has reported a model)`);
    return undefined;
  }
  let declared;
  try {
    declared = JSON.parse(readFileSync(path, "utf8")).model;
  } catch {
    tried.push(`${path} is not JSON`);
    return undefined;
  }
  const model = resolveModel(registry, declared);
  if (model === undefined) tried.push(`${path} records "${declared}", which the registry does not list`);
  return model;
}

const model = fromPromptLog() ?? fromEnv() ?? fromSession();
if (model === undefined) {
  process.stderr.write("commit-coauthor: cannot tell which model prepared this commit (BR-46)\n");
  for (const line of tried) process.stderr.write(`  ${line}\n`);
  process.stderr.write(
    "  Record the model in the prompt-log entry the commit cites (model: <registered id>),\n" +
      "  or set PROTO_FORGE_MODEL=<registered id> for this commit.\n",
  );
  process.exit(1);
}

// Insert before git's comment block when an editor template is in play, so the
// trailer stays inside the message git keeps. Trailers want a blank line before
// them unless the message already ends in a trailer paragraph.
const lines = msg.split("\n");
const firstComment = lines.findIndex((l) => l.startsWith("#"));
const body = firstComment === -1 ? lines : lines.slice(0, firstComment);
const rest = firstComment === -1 ? [] : lines.slice(firstComment);
while (body.length > 0 && body[body.length - 1].trim() === "") body.pop();
const lastLine = body[body.length - 1] ?? "";
const endsInTrailer = /^[A-Za-z-]+:\s*\S/.test(lastLine) && body.length > 1;
if (!endsInTrailer) body.push("");
body.push(coAuthorTrailer(model));
writeFileSync(msgFile, [...body, "", ...rest].join("\n").replace(/\n{3,}$/, "\n\n"));
process.stdout.write(`commit-coauthor: ${coAuthorTrailer(model)}\n`);

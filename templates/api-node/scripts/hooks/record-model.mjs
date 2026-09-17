import { mkdirSync, writeFileSync } from "node:fs";
import { hookInput, allow } from "./hook-lib.mjs";

// SessionStart + PostModelSwitch. Claude Code reports the model on exactly these
// events (`model` at session start, `to_model` after a switch). The hook writes
// it to .proto-forge/session.json — gitignored, per checkout — so that:
//   - the orchestrating model can read its own registered id before it writes a
//     prompt-log entry's `model:` field (BR-50), instead of guessing it;
//   - commit-coauthor has a last-resort source for the Co-Authored-By trailer
//     (BR-46) when the message names no prompt-log entry yet.
// A payload without a model leaves the previous record in place: a switch event
// always carries one, and a session start that omits it says nothing new.

const input = await hookInput();
const model = input.to_model ?? input.model;
if (typeof model !== "string" || model.trim() === "") allow();

mkdirSync(".proto-forge", { recursive: true });
writeFileSync(
  ".proto-forge/session.json",
  `${JSON.stringify({ model: model.trim(), recordedAt: new Date().toISOString(), event: input.hook_event_name ?? "unknown" }, null, 2)}\n`,
);
process.stdout.write(`proto-forge: recorded ${model.trim()} as this session's model (.proto-forge/session.json)\n`);
allow();

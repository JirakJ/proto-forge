import { spawnSync } from "node:child_process";
import { hookInput, relative } from "./hook-lib.mjs";

// PostToolUse(Write|Edit) on TS/TSX. Runs the two always-valid structural
// invariants immediately, while the change is still the thing being worked on.
//
// Only layer and testid run here. Both are true of any half-finished file: a
// popup either declares its layer or it does not. i18n is deliberately excluded —
// mid-edit a catalogue key legitimately has no caller yet, so running it on every
// keystroke would cry wolf until nobody reads it. It runs in `verify`.

const input = await hookInput();
const file = relative(input.tool_input?.file_path, input.cwd);
if (!/\.(ts|tsx)$/.test(file) || /\.(test|e2e)\./.test(file)) process.exit(0);

const findings = [];
for (const [gate, script] of [
  ["layer:scan", "scripts/layer-scan.mjs"],
  ["testid:scan", "scripts/testid-scan.mjs"],
]) {
  const result = spawnSync(process.execPath, [script], { encoding: "utf8" });
  if (result.status !== 0) findings.push(`${gate}\n${result.stderr.trim()}`);
}

if (findings.length === 0) process.exit(0);

process.stderr.write(`proto-forge: ${file} broke a structural invariant.\n\n`);
for (const f of findings) process.stderr.write(`${f}\n\n`);
process.stderr.write(
  "Fix it now rather than at verify: every zIndex comes from tokens.layer.*, every fixed surface\n" +
    "goes through <Portal>, and every testid identifies exactly one element.\n",
);
process.exit(2);

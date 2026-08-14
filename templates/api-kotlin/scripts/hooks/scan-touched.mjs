import { spawnSync } from "node:child_process";
import { hookInput, relative } from "./hook-lib.mjs";

// PostToolUse(Write|Edit) on Kotlin sources. Runs the two always-valid structural
// invariants immediately, while the change is still the thing being worked on.
//
// Only opid and arch run here. Both are true of any half-finished file: a route
// either lives in the registry with a well-formed operationId or it does not, and
// an import either obeys the derived profile or it does not. The contract and
// docs gates are deliberately excluded — mid-edit a handler legitimately has no
// regenerated spec or captured example yet, so running them on every keystroke
// would cry wolf until nobody reads it. They run in `verify`.

const input = await hookInput();
const file = relative(input.tool_input?.file_path, input.cwd);
if (!file.endsWith(".kt") || !file.startsWith("src/main/")) process.exit(0);

const findings = [];
for (const [gate, script] of [
  ["opid:scan", "scripts/opid-scan.mjs"],
  ["arch:verify", "scripts/arch-verify.mjs"],
]) {
  const result = spawnSync(process.execPath, [script], { encoding: "utf8" });
  if (result.status !== 0) findings.push(`${gate}\n${result.stderr.trim()}`);
}

if (findings.length === 0) process.exit(0);

process.stderr.write(`proto-forge: ${file} broke a structural invariant.\n\n`);
for (const f of findings) process.stderr.write(`${f}\n\n`);
process.stderr.write(
  "Fix it now rather than at verify: every route lives in the registry with a kebab-case\n" +
    "operationId, and every import follows the derived architecture profile.\n",
);
process.exit(2);

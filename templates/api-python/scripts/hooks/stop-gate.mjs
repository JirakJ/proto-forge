import { spawnSync } from "node:child_process";
import { checkConfig } from "../config.mjs";

// Stop. A last, cheap sweep before the turn ends: the scans that take milliseconds
// and answer "is the tree still in a state someone could commit?".
//
// It does NOT run the full `verify` — no build, no database, no coverage. A Stop
// hook that takes two minutes gets disabled within a day, and a disabled guardrail
// protects nothing. The expensive gates stay where they belong, in `pnpm verify`.

const { errors, conformance, waivers } = checkConfig();
const findings = [];

if (errors.length > 0) findings.push(`config:check\n${errors.map((e) => `  ${e}`).join("\n")}`);

for (const [gate, script] of [
  ["opid:scan", "scripts/opid-scan.mjs"],
  ["error:catalog", "scripts/error-catalog.mjs"],
]) {
  const result = spawnSync(process.execPath, [script], { encoding: "utf8" });
  if (result.status !== 0) findings.push(`${gate}\n${result.stderr.trim()}`);
}

if (conformance === "waived") {
  process.stderr.write(
    `proto-forge: conformance WAIVED — ${waivers.map((w) => `${w.gate} until ${w.expires}`).join(", ")}\n`,
  );
}

if (findings.length === 0) process.exit(0);

process.stderr.write("proto-forge: the tree is not in a committable state.\n\n");
for (const f of findings) process.stderr.write(`${f}\n\n`);
process.stderr.write("Run `pnpm verify` for the full picture, including build, coverage and the conformance run.\n");
process.exit(2);

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { spawnSync } from "node:child_process";
import { read, fail, ok } from "./lib.mjs";
import { E2E_RESULTS } from "./quality-lib.mjs";

// @adr 003 - the e2e conformance run (support tool; `test:e2e` is the last verify step)
//
// Boots the in-memory test host (`dotnet test --filter Category=conformance` →
// ConformanceTest), replays every harness scenario against it and asserts each
// exchange conforms to the route registry — status, shape and problem codes.
// This is the pass/fail gate OUTSIDE the coverage percentage: the wiring, the
// registrar and the kernel middleware are proven by exercising them, not by
// counting their lines.
//
// The scenario count becomes a machine fact: the test writes its green line to
// build/conformance-summary.txt (a test host's stdout does not reliably reach
// the runner), this tool echoes it, and on green .proto-forge/e2e-results.json
// records { scenarios, passed } for quality:report (BR-36) — the documented
// status is a derivation of this run, never a typed claim.
//
// Selftest seam: PROTO_FORGE_E2E names a plain .mjs runner to spawn with `node`
// instead of the dotnet slice — same contract as the emitter seam.

const SUMMARY = "build/conformance-summary.txt";

const override = process.env.PROTO_FORGE_E2E;
const run = override
  ? spawnSync(process.execPath, [override], { encoding: "utf8" })
  : spawnSync(
      "dotnet",
      ["test", "tests/App.Tests/App.Tests.csproj", "--nologo", "--filter", "Category=conformance"],
      { encoding: "utf8", env: { ...process.env, TZ: "UTC" } },
    );

process.stdout.write(run.stdout ?? "");
process.stderr.write(run.stderr ?? "");

if (run.error || run.status !== 0) {
  fail("test:e2e — the conformance run failed", [(run.error?.message ?? "").slice(0, 300)]);
}

// The green line: from the runner's stdout (the selftest seam prints it there)
// or from the summary file the test slice writes.
const output = `${run.stdout ?? ""}\n${!override && existsSync(SUMMARY) ? read(SUMMARY) : ""}`;
const counted = /conformance: (\d+) scenarios green/.exec(output);
if (counted === null) {
  fail("test:e2e — the runner exited green without its scenario count", [
    'expected a "conformance: N scenarios green" line — a run that cannot say how much it proved proved nothing countable',
  ]);
}
const scenarios = Number(counted[1]);
mkdirSync(dirname(E2E_RESULTS), { recursive: true });
writeFileSync(E2E_RESULTS, JSON.stringify({ scenarios, passed: scenarios }, null, 2) + "\n");

ok(`test:e2e: ${scenarios} harness scenario(s) conform to the route registry (${E2E_RESULTS} recorded)`);

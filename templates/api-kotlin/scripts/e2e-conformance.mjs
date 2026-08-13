import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { spawnSync } from "node:child_process";
import { fail, ok } from "./lib.mjs";
import { E2E_RESULTS } from "./quality-lib.mjs";

// @adr 003 - the e2e conformance run (support tool; `test:e2e` is the last verify step)
//
// Boots the Ktor test application (`./gradlew conformance` → ConformanceTest), replays
// every harness scenario against it and asserts each exchange conforms to the
// route registry — status, shape and problem codes. This is the pass/fail gate
// OUTSIDE the coverage percentage: the wiring, the registrar and the problem pages
// are proven by exercising them, not by counting their lines.
//
// The runner's stdout is captured (and echoed) so the scenario count it prints
// becomes a machine fact: on green, .proto-forge/e2e-results.json records
// { scenarios, passed } for quality:report (BR-36) — the documented status is a
// derivation of this run, never a typed claim. The conformance task turns
// showStandardStreams on so the test's own green line reaches this capture.
//
// Selftest seam: PROTO_FORGE_E2E names a plain .mjs runner to spawn with `node`
// instead of the Gradle slice — same contract as the emitter seam.

const override = process.env.PROTO_FORGE_E2E;
const run = override
  ? spawnSync(process.execPath, [override], { encoding: "utf8" })
  : spawnSync("./gradlew", ["conformance", "--console=plain"], { encoding: "utf8" });

process.stdout.write(run.stdout ?? "");
process.stderr.write(run.stderr ?? "");

if (run.error || run.status !== 0) {
  fail("test:e2e — the conformance run failed", [(run.error?.message ?? "").slice(0, 300)]);
}

const counted = /conformance: (\d+) scenarios green/.exec(run.stdout ?? "");
if (counted === null) {
  fail("test:e2e — the runner exited green without its scenario count", [
    'expected a "conformance: N scenarios green" line — a run that cannot say how much it proved proved nothing countable',
  ]);
}
const scenarios = Number(counted[1]);
mkdirSync(dirname(E2E_RESULTS), { recursive: true });
writeFileSync(E2E_RESULTS, JSON.stringify({ scenarios, passed: scenarios }, null, 2) + "\n");

ok(`test:e2e: ${scenarios} harness scenario(s) conform to the route registry (${E2E_RESULTS} recorded)`);

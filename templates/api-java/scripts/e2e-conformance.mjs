import { spawnSync } from "node:child_process";
import { fail, ok } from "./lib.mjs";

// @adr 003 - the e2e conformance run (support tool; `test:e2e` is the last verify step)
//
// Boots the MockMvc slice (`./gradlew conformance` → ConformanceTest), replays
// every harness scenario against it and asserts each exchange conforms to the
// route registry — status, shape and problem codes. This is the pass/fail gate
// OUTSIDE the coverage percentage: the wiring, the registrar and the error advice
// are proven by exercising them, not by counting their lines.
//
// Selftest seam: PROTO_FORGE_E2E names a plain .mjs runner to spawn with `node`
// instead of the Gradle slice — same contract as the emitter seam.

const override = process.env.PROTO_FORGE_E2E;
const run = override
  ? spawnSync(process.execPath, [override], { stdio: "inherit" })
  : spawnSync("./gradlew", ["conformance", "--console=plain"], { stdio: "inherit" });

if (run.error || run.status !== 0) {
  fail("test:e2e — the conformance run failed", [(run.error?.message ?? "").slice(0, 300)]);
}
ok("test:e2e: every harness scenario conforms to the route registry");

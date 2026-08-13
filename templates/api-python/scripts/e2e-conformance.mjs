import { spawnSync } from "node:child_process";
import { fail, ok } from "./lib.mjs";

// @adr 003 - the e2e conformance run (support tool; `test:e2e` is the last verify step)
//
// Boots the app in-process (app/e2e/run.py), replays every harness scenario
// against it and asserts each captured exchange conforms to the committed
// contract — status, shape and problem codes. This is the pass/fail gate
// OUTSIDE the coverage percentage: the wiring, the boundary validation and the
// error handler are proven by exercising them, not by counting their lines.
//
// Selftest seam: PROTO_FORGE_E2E names a plain .mjs runner to spawn with `node`
// instead of `uv run python` — same contract as the emitter seam.

const RUNNER = "app.e2e.run";

const override = process.env.PROTO_FORGE_E2E;
const run = override
  ? spawnSync(process.execPath, [override], { stdio: "inherit" })
  : spawnSync("uv", ["run", "python", "-m", RUNNER], { stdio: "inherit" });

if (run.error || run.status !== 0) {
  fail("test:e2e — the conformance run failed", [(run.error?.message ?? "").slice(0, 300)]);
}
ok("test:e2e: every harness scenario conforms to the committed contract");

import { spawnSync } from "node:child_process";
import { fail, ok } from "./lib.mjs";

// @adr 003 - the e2e conformance run (support tool; `test:e2e` is the last verify step)
//
// Boots the app in-process (src/e2e/run.ts), replays every harness scenario
// against it and asserts each captured exchange conforms to the committed
// contract — status, shape and problem codes. This is the pass/fail gate
// OUTSIDE the coverage percentage: the socket, the wiring and the error handler
// are proven by exercising them, not by counting their lines.
//
// Selftest seam: PROTO_FORGE_E2E names a plain .mjs runner to spawn with `node`
// instead of `pnpm exec tsx` — same contract as the emitter seam.

const RUNNER = "src/e2e/run.ts";

const override = process.env.PROTO_FORGE_E2E;
const run = override
  ? spawnSync(process.execPath, [override], { stdio: "inherit" })
  : spawnSync("pnpm", ["exec", "tsx", RUNNER], { stdio: "inherit" });

if (run.error || run.status !== 0) {
  fail("test:e2e — the conformance run failed", [(run.error?.message ?? "").slice(0, 300)]);
}
ok("test:e2e: every harness scenario conforms to the committed contract");

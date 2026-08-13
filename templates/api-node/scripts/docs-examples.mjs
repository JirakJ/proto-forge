import { existsSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fail, ok } from "./lib.mjs";
import { operationIds, examplesDirFor, handlerSourceHash, EXAMPLES_LOCK } from "./docs-lib.mjs";

// @adr 009 - the capture half of BR-26 (support tool, not a gate)
//   pnpm docs:examples    run the capture harness, then re-pin .examples.lock
//
// The capture harness (src/e2e/capture.ts) boots the app in-process, replays
// the harness scenarios and writes one docs/api/<opid>/examples/*.json per
// exchange — a captured example, never a hand-written one. Afterwards this tool
// records WHICH handler sources the captures were taken from, so docs:verify
// can fail a stale one.
//
// Selftest seam: PROTO_FORGE_CAPTURE names a plain .mjs capture script to spawn
// with `node` instead of `pnpm exec tsx` — same contract as the emitter seam in
// contract-verify.mjs.

const CAPTURE = "src/e2e/capture.ts";

const override = process.env.PROTO_FORGE_CAPTURE;
const run = override
  ? spawnSync(process.execPath, [override], { stdio: "inherit" })
  : spawnSync("pnpm", ["exec", "tsx", CAPTURE], { stdio: "inherit" });
if (run.error || run.status !== 0) {
  fail("docs:examples — the capture harness failed; no lock was written", [
    (run.error?.message ?? "").slice(0, 300),
  ]);
}

const captured = [];
for (const { id } of operationIds()) {
  const dir = examplesDirFor(id);
  if (!existsSync(dir)) continue;
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".json")).sort()) {
    captured.push(join(dir, file));
  }
}

const lock = { source: handlerSourceHash(), captured: [...new Set(captured)].sort() };
writeFileSync(EXAMPLES_LOCK, JSON.stringify(lock, null, 2) + "\n");
ok(`docs:examples: ${lock.captured.length} capture(s), source ${lock.source.slice(0, 12)}… pinned in ${EXAMPLES_LOCK}`);

import { existsSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fail, ok } from "./lib.mjs";
import { adrDigests, anchoredAdrs, operationIds, examplesDirFor, handlerSourceHash, EXAMPLES_LOCK } from "./docs-lib.mjs";

// @adr 009 - the capture half of BR-26 (support tool, not a gate)
//   pnpm docs:examples    run the capture slice, then re-pin .examples.lock
//
// The capture slice (`dotnet test --filter Category=capture` → CaptureTest)
// boots the in-memory test host over the fixture repository, replays the
// harness scenarios and writes one docs/api/<opid>/examples/*.json per
// exchange — a captured example, never a hand-written one. Afterwards this tool
// records WHICH handler sources the captures were taken from, so docs:verify
// can fail a stale one.
//
// Selftest seam: PROTO_FORGE_CAPTURE names a plain .mjs capture script to spawn
// with `node` instead of the dotnet slice — same contract as the emitter seam in
// contract-verify.mjs.

const override = process.env.PROTO_FORGE_CAPTURE;
const run = override
  ? spawnSync(process.execPath, [override], { stdio: "inherit" })
  : spawnSync(
      "dotnet",
      ["test", "tests/App.Tests/App.Tests.csproj", "--nologo", "--filter", "Category=capture"],
      { stdio: "inherit", env: { ...process.env, TZ: "UTC" } },
    );
if (run.error || run.status !== 0) {
  fail("docs:examples — the capture slice failed; no lock was written", [
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

// BR-42: the decisions these handlers implement, at the version the pages were
// written against. Derived from the @adr anchors, so it cannot disagree with them.
const lock = { source: handlerSourceHash(), adrs: adrDigests(anchoredAdrs()), captured: [...new Set(captured)].sort() };
writeFileSync(EXAMPLES_LOCK, JSON.stringify(lock, null, 2) + "\n");
ok(`docs:examples: ${lock.captured.length} capture(s), source ${lock.source.slice(0, 12)}… pinned in ${EXAMPLES_LOCK}`);

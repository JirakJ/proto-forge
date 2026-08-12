import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { walk, fail, ok } from "./lib.mjs";

// Runs every gate's selftest suite. Each suite is spawned as its own process
// rather than imported: report() exits, so importing them would stop at the first.

const SCRIPTS = resolve(dirname(new URL(import.meta.url).pathname));
const suites = walk(SCRIPTS, (p) => p.endsWith(".selftest.mjs")).sort();

if (suites.length === 0) fail("selftest-all FAILED", ["no *.selftest.mjs suites found — a gate without a selftest is a gate nobody has seen fail"]);

const failures = [];
for (const suite of suites) {
  const r = spawnSync(process.execPath, [suite], { encoding: "utf8", cwd: join(SCRIPTS, "..") });
  process.stdout.write(`${r.stdout}`);
  if (r.status !== 0) failures.push(`${suite.replace(`${SCRIPTS}/`, "")}: ${r.stderr.trim()}`);
}

if (failures.length > 0) fail(`selftest-all FAILED (${failures.length}/${suites.length} suites)`, failures);
ok(`selftest-all: ${suites.length} suites green`);

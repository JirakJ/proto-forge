import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, resolve } from "node:path";
import { fail, ok } from "./lib.mjs";

// The only real proof that the template works: copy it out, install it, and run its
// own verify. Everything else the plugin checks is a proxy for this.
//
// Kept out of `pnpm verify` deliberately — it installs a dependency tree and drives a
// browser, so it belongs in CI and in a release, not in the loop someone runs while
// editing a gate script.

const SOURCE = "template";
const SCRATCH = resolve(".scratch/verify-template");
const KEEP = process.argv.includes("--keep");

if (!existsSync(SOURCE)) fail("verify:template FAILED", [`${SOURCE}/ is missing`]);

rmSync(SCRATCH, { recursive: true, force: true });
mkdirSync(SCRATCH, { recursive: true });

// Copy everything except what an install regenerates. dereference keeps the copy
// self-contained: a symlinked node_modules would point back at the source tree and
// the run would no longer be isolated.
const SKIP = new Set(["node_modules", "dist", "coverage", "playwright-report", "test-results", ".stryker-tmp"]);
cpSync(SOURCE, SCRATCH, {
  recursive: true,
  dereference: true,
  filter: (src) => !SKIP.has(src.split("/").pop()),
});

const step = (label, command, args) => {
  process.stdout.write(`\n── ${label} ─────────────────────────────────────────\n`);
  const r = spawnSync(command, args, { cwd: SCRATCH, stdio: "inherit", shell: false });
  if (r.status !== 0) {
    fail("verify:template FAILED", [
      `${label} exited ${r.status}`,
      `the scratch copy is at ${SCRATCH} — inspect it there, it is not cleaned up on failure`,
    ]);
  }
};

step("pnpm install --frozen-lockfile", "pnpm", ["install", "--frozen-lockfile"]);
step("pnpm verify", "pnpm", ["verify"]);

if (!KEEP) rmSync(SCRATCH, { recursive: true, force: true });
ok(`verify:template: the shipped template installs and passes its own verify${KEEP ? ` (kept at ${SCRATCH})` : ""}`);

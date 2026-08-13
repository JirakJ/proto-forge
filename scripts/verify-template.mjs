import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fail, ok, readJson } from "./lib.mjs";

// The only real proof that a template works: copy it out, install it, and run its
// own verify. Everything else the plugin checks is a proxy for this.
//
// Kept out of `pnpm verify` deliberately — it installs a dependency tree and drives a
// browser (or a JVM, or a Python toolchain), so it belongs in CI and in a release,
// not in the loop someone runs while editing a gate script.
//
// Which template comes from --template <id> against references/templates.json —
// CI runs one leg per registry entry.

const REGISTRY = "references/templates.json";
const TEMPLATES = existsSync(REGISTRY) ? (readJson(REGISTRY).templates ?? []) : [];

const flag = process.argv.indexOf("--template");
const id = flag === -1 ? undefined : process.argv[flag + 1];
const template = TEMPLATES.find((t) => t.id === id);
if (template === undefined) {
  fail("verify:template FAILED", [
    id === undefined ? "no --template <id> given" : `"${id}" is not a registered template`,
    `registered: ${TEMPLATES.map((t) => t.id).join(", ") || "(none — is ${REGISTRY} missing?)"}`,
  ]);
}

const SOURCE = template.dir;
const SCRATCH = resolve(`.scratch/verify-${template.id}`);
const KEEP = process.argv.includes("--keep");

if (!existsSync(SOURCE)) fail("verify:template FAILED", [`${SOURCE}/ is missing`]);

rmSync(SCRATCH, { recursive: true, force: true });
mkdirSync(SCRATCH, { recursive: true });

// Copy everything except what an install regenerates. dereference keeps the copy
// self-contained: a symlinked node_modules would point back at the source tree and
// the run would no longer be isolated.
const SKIP = new Set([
  "node_modules", "dist", "coverage", "playwright-report", "test-results", ".stryker-tmp",
  // backend-template build residue, harmless to list before those templates exist:
  "build", ".gradle", ".venv", "__pycache__", ".pytest_cache", ".mypy_cache", ".ruff_cache",
]);
cpSync(SOURCE, SCRATCH, {
  recursive: true,
  dereference: true,
  filter: (src) => !SKIP.has(src.split("/").pop()),
});

const step = (label, command, args) => {
  process.stdout.write(`\n── [${template.id}] ${label} ─────────────────────────────────\n`);
  const r = spawnSync(command, args, { cwd: SCRATCH, stdio: "inherit", shell: false });
  if (r.status !== 0) {
    fail("verify:template FAILED", [
      `[${template.id}] ${label} exited ${r.status}`,
      `the scratch copy is at ${SCRATCH} — inspect it there, it is not cleaned up on failure`,
    ]);
  }
};

step("pnpm install --frozen-lockfile", "pnpm", ["install", "--frozen-lockfile"]);
step("pnpm verify", "pnpm", ["verify"]);

if (!KEEP) rmSync(SCRATCH, { recursive: true, force: true });
ok(`verify:template [${template.id}]: the shipped template installs and passes its own verify${KEEP ? ` (kept at ${SCRATCH})` : ""}`);

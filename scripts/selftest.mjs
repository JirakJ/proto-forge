import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fail, ok } from "./lib.mjs";

// The plugin-side twin of template/scripts/gates-selftest.mjs, same reasoning: a
// gate nobody has seen fail is a gate nobody knows works. Builds a throwaway repo
// per case, breaks exactly one thing, and asserts the gate's exit code.
//
// Each gate ships a `<gate>.selftest.mjs` that calls expect() then report();
// scripts/selftest-all.mjs runs every one of them in a single process.

const SCRIPTS = resolve(dirname(new URL(import.meta.url).pathname));
const failures = [];
let cases = 0;

function project(files) {
  const dir = mkdtempSync(join(tmpdir(), "proto-forge-plugin-gate-"));
  for (const [path, body] of Object.entries(files)) {
    const full = join(dir, path);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, typeof body === "string" ? body : JSON.stringify(body, null, 2));
  }
  return dir;
}

function run(script, dir, args) {
  // HOME is redirected so an operator's own config cannot change a verdict.
  const r = spawnSync(process.execPath, [join(SCRIPTS, script), ...args], {
    cwd: dir,
    encoding: "utf8",
    env: { ...process.env, HOME: dir },
  });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
}

/**
 * @param name    what this case demonstrates
 * @param script  file name under scripts/
 * @param files   the throwaway repo: path -> string body, or an object to JSON.stringify
 * @param opts    { pass: boolean, matching?: RegExp, args?: string[] }
 */
export function expect(name, script, files, { pass, matching, args = [] }) {
  cases += 1;
  const dir = project(files);
  try {
    const { code, out } = run(script, dir, args);
    const passed = code === 0;
    if (passed !== pass) {
      failures.push(`${name}: expected ${pass ? "PASS" : "FAIL"}, got ${passed ? "PASS" : "FAIL"} — ${out.trim()}`);
    } else if (matching !== undefined && !matching.test(out)) {
      failures.push(`${name}: correct verdict but the message never mentions ${matching} — got ${out.trim()}`);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

export function report() {
  if (failures.length > 0) fail(`selftest FAILED (${failures.length}/${cases})`, failures);
  ok(`selftest: ${cases} cases, every gate rejects what it claims to`);
}

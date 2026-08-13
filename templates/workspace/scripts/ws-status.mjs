import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fail } from "./lib.mjs";

// @adr 001 - orchestration support: one screen answering "where is this workspace?"
//
// Support script, NOT a gate (registered notAGate): it reports, it never fails a
// build. Per part: is the directory present, is it a git checkout, is its working
// tree clean, does its facets.json agree on pairedBrief — plus the verify hint,
// because each part's own `pnpm verify` is that part's truth, not this script's.

const write = (s) => process.stdout.write(`${s}\n`);

if (!existsSync("workspace.json")) fail("ws-status: workspace.json is missing — run ws:verify for the full diagnosis");
let manifest;
try {
  manifest = JSON.parse(readFileSync("workspace.json", "utf8"));
} catch (e) {
  fail(`ws-status: workspace.json does not parse: ${e.message}`);
}
const parts = Array.isArray(manifest.parts) ? manifest.parts : [];

write(`workspace: ${parts.length} part(s), pairedBrief ${String(manifest.pairedBrief).slice(0, 12)}…`);

for (const p of parts) {
  const label = `${String(p.id).padEnd(6)} (${p.template} → ${p.dir}/, ${p.role})`;
  if (typeof p.dir !== "string" || !existsSync(p.dir)) {
    write(`  ${label}`);
    write(`      absent — pnpm ws:bootstrap prints the command that materializes it`);
    continue;
  }
  write(`  ${label}`);
  write(`      git:    ${gitLine(p.dir)}`);
  write(`      brief:  ${briefLine(p.dir)}`);
  write(`      verify: cd ${p.dir} && pnpm verify`);
}

const source = manifest.contract?.source;
if (typeof source === "string") {
  write(`  contract ${source}: ${existsSync(source) ? "present" : "absent (produced by the backend part's contract:generate)"}`);
}

function gitLine(dir) {
  if (!existsSync(join(dir, ".git"))) return "not a git checkout yet";
  const r = spawnSync("git", ["-C", dir, "status", "--porcelain"], { encoding: "utf8" });
  if (r.status !== 0) return "git status unavailable";
  const changes = r.stdout.split("\n").filter((l) => l.trim() !== "").length;
  return changes === 0 ? "clean" : `${changes} uncommitted change(s)`;
}

function briefLine(dir) {
  const facetsPath = join(dir, ".proto-forge", "facets.json");
  if (!existsSync(facetsPath)) return "no .proto-forge/facets.json — not a scaffolded part";
  try {
    const facets = JSON.parse(readFileSync(facetsPath, "utf8"));
    if (facets.pairedBrief === undefined) return "facets.json records no pairedBrief";
    return facets.pairedBrief === manifest.pairedBrief ? "pairedBrief agrees" : "pairedBrief DISAGREES — ws:verify will fail";
  } catch {
    return "facets.json unreadable";
  }
}

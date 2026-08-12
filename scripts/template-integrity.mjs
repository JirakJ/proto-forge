import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fail, ok } from "./lib.mjs";

// Is the shipped template internally consistent — is its byte-pinned seed still the
// tree seed.lock claims, and does its structure still match its committed snapshot?
//
// This delegates to the template's OWN snapshot:diff rather than recomputing the
// hash here. Two implementations of one hash drift, and the day they disagree the
// question "which is right?" has no good answer. The hash is also cwd-relative
// (sorted paths plus bytes), so a second implementation run from the repository root
// would produce a different digest for an identical tree and look like tampering.

const TEMPLATE = "template";
const GATE = "scripts/snapshot-diff.mjs";

for (const required of [TEMPLATE, `${TEMPLATE}/${GATE}`, `${TEMPLATE}/.proto-forge/seed.lock`]) {
  if (!existsSync(required)) fail("template-integrity FAILED", [`${required} is missing`]);
}

const r = spawnSync(process.execPath, [GATE], { cwd: TEMPLATE, encoding: "utf8" });
const out = `${r.stdout ?? ""}${r.stderr ?? ""}`.trim();

if (r.status !== 0) {
  fail("template-integrity FAILED", [
    "the template's own snapshot:diff rejected the shipped tree:",
    ...out.split("\n"),
    "",
    "A seed mismatch is either tamper or an unrecorded upgrade. The fix is an ADR plus",
    "pnpm seed:lock inside template/ — never editing seed.lock to match the tree.",
  ]);
}

ok(`template-integrity: ${out.replace(/^✓\s*/, "")}`);

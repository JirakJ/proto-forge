import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fail, ok, readJson } from "./lib.mjs";

// Is every shipped template internally consistent — is its byte-pinned seed still
// the tree seed.lock claims, and does its structure still match its committed
// snapshot? Templates come from references/templates.json (ADR 007); one failure
// names its template, because a web failure and an api-java failure have different
// causes and one combined message hides which happened.
//
// This delegates to each template's OWN snapshot:diff rather than recomputing the
// hash here. Two implementations of one hash drift, and the day they disagree the
// question "which is right?" has no good answer. The hash is also cwd-relative
// (sorted paths plus bytes), so a second implementation run from the repository root
// would produce a different digest for an identical tree and look like tampering.

const REGISTRY = "references/templates.json";
const GATE = "scripts/snapshot-diff.mjs";

if (!existsSync(REGISTRY)) fail("template-integrity FAILED", [`${REGISTRY} is missing`]);
const TEMPLATES = readJson(REGISTRY).templates ?? [];
if (TEMPLATES.length === 0) fail("template-integrity FAILED", [`${REGISTRY} lists no templates`]);

const lines = [];
for (const t of TEMPLATES) {
  for (const required of [t.dir, `${t.dir}/${GATE}`, `${t.dir}/.proto-forge/seed.lock`]) {
    if (!existsSync(required)) fail("template-integrity FAILED", [`${t.id}: ${required} is missing`]);
  }

  const r = spawnSync(process.execPath, [GATE], { cwd: t.dir, encoding: "utf8" });
  const out = `${r.stdout ?? ""}${r.stderr ?? ""}`.trim();

  if (r.status !== 0) {
    fail("template-integrity FAILED", [
      `template "${t.id}": its own snapshot:diff rejected the shipped tree:`,
      ...out.split("\n"),
      "",
      "A seed mismatch is either tamper or an unrecorded upgrade. The fix is an ADR plus",
      `pnpm seed:lock inside ${t.dir}/ — never editing seed.lock to match the tree.`,
    ]);
  }
  lines.push(`${t.id}: ${out.replace(/^✓\s*/, "")}`);
}

ok(`template-integrity: ${lines.join(" · ")}`);

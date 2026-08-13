import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { loadConfig } from "./config.mjs";
import { fail, note, ok } from "./lib.mjs";

// @adr 009 - propagation happens the moment something ships, IF the operator said so
//   pnpm sync:auto    for each integration with autoPropagate on: stage AND send
//                     for everything else: stage only, and say why nothing was sent
//
// The pipeline calls this after every accepted-ADR commit and at release. With every
// integration in its default state it is a no-op beyond staging — the "no pipeline
// phase ever calls out" rule still holds, because calling out is exactly what
// autoPropagate turns on: a committed, reviewed, standing consent. Everything a live
// write requires (enabled, dryRun:false, the network allowlist, credentials) is still
// asserted by each sync script; autoPropagate stands in only for the per-run --approve.

const SCRIPTS = resolve(dirname(new URL(import.meta.url).pathname));
const cfg = loadConfig();

const TARGETS = [
  { name: "confluence", script: "sync-confluence.mjs" },
  { name: "jira", script: "sync-jira.mjs" },
];

let sent = 0;
let failed = 0;

for (const target of TARGETS) {
  const integration = cfg.integrations?.[target.name] ?? {};
  const auto = integration.enabled === true && integration.dryRun === false && integration.autoPropagate === true;

  const args = [join(SCRIPTS, target.script)];
  if (auto) args.push("--commit");

  const run = spawnSync(process.execPath, args, { stdio: "inherit" });
  if (run.status !== 0) {
    failed += 1;
    continue;
  }
  if (auto) {
    sent += 1;
  } else {
    note(
      `${target.name}: staged only — live propagation needs integrations.${target.name} ` +
        `{ enabled: true, dryRun: false, autoPropagate: true } plus the network allowlist and credentials`,
    );
  }
}

if (failed > 0) fail(`sync:auto — ${failed} integration(s) failed; staged payloads are in .proto-forge/outbox/`);
ok(`sync:auto: ${sent} integration(s) propagated live, ${TARGETS.length - sent} staged only`);

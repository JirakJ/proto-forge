import { existsSync, readFileSync } from "node:fs";
import { loadConfig, checkConfig, configSources, gateMode, MANDATORY_GATES, DEFAULTS, FAST_GATES } from "./config.mjs";
import { fail, note, ok } from "./lib.mjs";

// @adr 009 - the operator-facing view of the gate configuration
//   pnpm config:show   what is actually in force, and where each value came from
//   pnpm config:check  validate the config + waivers (runs first in `verify`)
// `check` is deliberately the default: an unreadable or dishonest config should
// stop a run before any gate has a chance to report a misleading pass.

const command = process.argv[2] ?? "check";
const cfg = loadConfig();
const write = (s) => process.stdout.write(`${s}\n`);

if (command === "show") {
  const sources = configSources();
  write("sources (later wins):");
  write("  defaults (built in)");
  for (const s of sources) write(`  ${s}`);
  if (sources.length === 0) write("  — no config file found, running on strict defaults —");

  write("\ngates:");
  for (const name of Object.keys(DEFAULTS.gates)) {
    const configured = cfg.gates?.[name]?.mode ?? "error";
    const effective = gateMode(name);
    const mandatory = MANDATORY_GATES.includes(name) ? " (mandatory)" : "";
    const forced = configured !== effective ? `  ← "${configured}" ignored: no live waiver` : "";
    write(`  ${name.padEnd(12)} ${effective}${mandatory}${forced}`);
  }

  write("\nintegrations:");
  for (const [name, i] of Object.entries(cfg.integrations ?? {})) {
    const state = i.enabled ? (i.dryRun ? "enabled (dry-run: writes to .proto-forge/outbox only)" : "ENABLED, LIVE WRITES") : "disabled";
    write(`  ${name.padEnd(12)} ${state}`);
  }

  write("\nguardrails:");
  const g = cfg.guardrails ?? {};
  write(`  network                    ${g.network?.allow ? `allowed → ${(g.network.allowedHosts ?? []).join(", ") || "(no hosts listed)"}` : "blocked"}`);
  write(`  requireApproval            ${(g.requireApproval ?? []).join(", ") || "(none)"}`);
  write(`  protectedPaths             ${(g.protectedPaths ?? []).length} pattern(s)`);
  write(`  freezeThresholds           ${g.freezeThresholds}`);

  const { conformance, waivers } = checkConfig(cfg);
  write(`\nconformance: ${conformance}`);
  for (const w of waivers) write(`  ${w.gate} → ${cfg.gates[w.gate].mode} until ${w.expires} (ADR ${w.adr}): ${w.reason}`);
  process.exit(0);
}

if (command !== "check") fail(`unknown command "${command}" — use: show | check`);

const { errors, warnings, conformance, waivers } = checkConfig(cfg);

// BR-45: the fast lane is PINNED. package.json's verify:fast must invoke the
// parallel runner (which executes exactly FAST_GATES), and every fast gate must
// also run in the full chain — a lane that drifted, narrowed, or ran a gate
// `verify` does not would let a feature commit pass a bar the phase gate then
// contradicts. (A gate selftest fixture has no package.json; the pin is
// asserted wherever one exists.)
if (existsSync("package.json")) {
  const scripts = JSON.parse(readFileSync("package.json", "utf8")).scripts ?? {};
  const RUNNER = "node scripts/verify-fast.mjs";
  if (scripts["verify:fast"] === undefined) {
    errors.push('package.json has no "verify:fast" script — the fast lane is part of the template contract (BR-45)');
  } else if (scripts["verify:fast"] !== RUNNER) {
    errors.push(`package.json "verify:fast" drifts from the pinned fast chain — expected exactly: ${RUNNER}, the parallel runner over FAST_GATES (BR-45)`);
  }
  const full = scripts.verify ?? "";
  for (const gate of FAST_GATES) {
    if (!full.includes(`pnpm run ${gate}`)) {
      errors.push(`fast gate "${gate}" is missing from the full verify chain — the fast lane may only subset verify, never exceed it (BR-45)`);
    }
  }
} else {
  note("config: no package.json here — the verify:fast pin (BR-45) has nothing to check");
}

for (const w of warnings) note(w);
if (errors.length) fail("config:check FAILED", errors);

if (conformance === "waived") {
  note(`conformance: WAIVED — ${waivers.length} mandatory gate(s) relaxed:`);
  for (const w of waivers) {
    process.stderr.write(`    ${w.gate} → "${cfg.gates[w.gate].mode}" until ${w.expires} (ADR ${w.adr}): ${w.reason}\n`);
  }
}
ok(`config:check: ${Object.keys(DEFAULTS.gates).length} gates configured, conformance ${conformance}`);

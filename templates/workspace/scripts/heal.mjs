import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { loadConfig } from "./config.mjs";

// @adr 001 - pnpm heal: tiered, bounded, on-the-record self-healing (NFR-19)
//
// Support tool (notAGate). A red `pnpm verify` is worked in three tiers, each
// cheaper than the next and each bounded by the committed config:
//
//   Tier 1 — mechanical (selfHealing.mechanical, default ON): the failing gate
//   is looked up in the HEALING REGISTRY below and its deterministic
//   regeneration replays. Derivations only — a regeneration never moves a
//   floor, never writes the snapshot or the seed, never adds a waiver.
//   Tier 2 — agent (selfHealing.agent, default OFF): a bounded agent pass over
//   the failing gate. Runs ONLY with selfHealing.agent.enabled = true in the
//   COMMITTED config — committing that flag IS the operator's standing,
//   reviewed consent (the autoPropagate precedent): it went through review to
//   get there, which a flag typed in the moment never does.
//   Tier 3 — escalate: print the blocked report and exit 1. Stamping
//   gates[].result = "blocked" into .proto-forge/snapshot.json is the
//   generation pipeline's consent act, not this tool's — the operator or CI
//   acts on the report.
//
// Hard-stop gates (secrets, high/critical audit) NEVER enter any tier: the
// SKILL's gate-failure protocol says no auto-remediation, and this tool obeys
// it before the registry is even consulted. Every pass — mechanical or agent —
// writes a .prompts/ entry BEFORE it acts (write-before-act); the entry's
// timestamp is the log's own provenance convention, never an input to any
// decision here (no clock in decisions).
//
// Selftest seams (fixture-only, the contract-emit precedent):
//   PROTO_FORGE_HEAL_VERIFY    replaces `pnpm verify` (the full-chain run)
//   PROTO_FORGE_HEAL_GATE_CMD  replaces `pnpm run <gate script>` (the recheck)
//   PROTO_FORGE_HEAL_REGISTRY  path to a JSON file replacing the registry
// The trio lets a selftest simulate a gate that fails until a marker appears
// and a regen that creates it — the loop is proven offline, no pnpm involved.

// --- THE HEALING REGISTRY -------------------------------------------------------
// Data, not heuristics: failing gate → its deterministic regeneration. An entry
// may carry a signature guard — `requiresPath` (the entry applies only while
// that path exists) or `outputMatch` (only while the gate's output matches) —
// so a semantic failure wearing the same gate name falls through to tier 2/3.
//
// NEVER in this registry: snapshot, seed, adr, prompt — each is a consent act
// or a semantic fix, not a regeneration. ws is deliberately absent too: a
// manifest/tree disagreement means a part must be materialized or a
// declaration corrected — a decision, not bytes gone stale.
const HEALING_REGISTRY = {
  status: {
    check: "status:verify",
    regen: ["pnpm quality:report"],
    reason: "the STATUS.md block is generated from the manifest and chain — regenerating restates facts",
  },
};

// Gates that never enter any tier, by name and by signature: the gate-failure
// protocol's hard-stop list, matched conservatively (a false positive escalates
// to a human, which is the safe direction).
const HARD_STOP_GATES = ["sec", "security", "sec:scan"];
const HARD_STOP_OUTPUT = /secret|audit/i;

// Banner-script → gate-name normalisation for chain links whose tool prints no
// "✗ <gate> FAILED" line of its own (the test tiers). Fallback: the prefix
// before ":" — good enough for a registry miss to land in tier 2/3 honestly.
const SCRIPT_TO_GATE = { "ws:verify": "ws" };

const stdout = (s) => process.stdout.write(s);
const stderr = (s) => process.stderr.write(s);
const tail = (s, lines = 100) => s.split("\n").slice(-lines).join("\n").trim();

const registry = process.env.PROTO_FORGE_HEAL_REGISTRY
  ? JSON.parse(readFileSync(process.env.PROTO_FORGE_HEAL_REGISTRY, "utf8"))
  : HEALING_REGISTRY;

function runCmd(cmdline) {
  const [exe, ...args] = cmdline.split(/\s+/).filter((p) => p !== "");
  const r = spawnSync(exe, args, { encoding: "utf8" });
  return { code: r.error ? 1 : (r.status ?? 1), out: `${r.stdout ?? ""}${r.stderr ?? ""}`, error: r.error };
}

const runVerify = () => runCmd(process.env.PROTO_FORGE_HEAL_VERIFY ?? "pnpm verify");

function runGate(script) {
  const seam = process.env.PROTO_FORGE_HEAL_GATE_CMD;
  if (seam !== undefined) return runCmd(seam);
  if (script !== null) return runCmd(`pnpm run ${script}`);
  return runVerify(); // no single-gate handle — the full chain is the honest recheck
}

/** The failing gate: last "✗ <name> FAILED" line, else the last pnpm run banner. */
function parseFailingGate(out) {
  const banners = [...out.matchAll(/^> \S+@\S+ ([A-Za-z0-9:._-]+)/gm)].map((m) => m[1]);
  const script = banners.length > 0 ? banners[banners.length - 1] : null;
  const failed = [...out.matchAll(/✗ ([a-z0-9:_-]+) FAILED/g)].map((m) => m[1]);
  const gate = failed.length > 0 ? failed[failed.length - 1] : script === null ? "verify" : (SCRIPT_TO_GATE[script] ?? script.split(":")[0]);
  return { gate, script };
}

/** The failing gate's own output: everything after the last chain-link banner. */
function excerptOf(out) {
  const banners = [...out.matchAll(/^> \S+@\S+ [A-Za-z0-9:._-]+.*$/gm)];
  const from = banners.length > 0 ? banners[banners.length - 1].index : 0;
  return tail(out.slice(from));
}

const isHardStop = (gate, excerpt) => HARD_STOP_GATES.includes(gate) || HARD_STOP_OUTPUT.test(excerpt);

function hardStopExit(gate) {
  stderr(`✗ heal: "${gate}" is a hard-stop gate — it never enters any healing tier.\n`);
  stderr("    Hard-stop gates (secrets, high/critical audit, contradiction): no auto-remediation.\n");
  stderr("    Stop, emit a `proposed` ADR describing the finding, surface to the operator (SKILL.md, gate-failure protocol).\n");
  process.exit(1);
}

// --- prompt log -----------------------------------------------------------------
// Write-before-act: the entry exists before the regen or the agent runs, so an
// aborted pass still left its record. The timestamp is the log's convention
// (provenance), not a decision input.
const PROMPTS = ".prompts";

function nextPromptId() {
  const ids = existsSync(PROMPTS)
    ? readdirSync(PROMPTS).map((f) => f.match(/^(\d{4})-/)?.[1]).filter((id) => id !== undefined).map(Number)
    : [];
  return Math.max(0, ...ids) + 1;
}

function writePromptEntry(gate, pass, action, excerpt) {
  const id = String(nextPromptId()).padStart(4, "0");
  const slug = `heal-${gate.replace(/[^a-z0-9]+/g, "-")}-pass-${pass}`;
  const path = join(PROMPTS, `${id}-${slug}.md`);
  mkdirSync(PROMPTS, { recursive: true });
  writeFileSync(
    path,
    `---\nid: ${id}\ntimestamp: ${new Date().toISOString()}\nphase: heal\nauthor: proto-forge-heal\n---\n\n## Prompt\n\n${action}\n\nGate output (tail):\n\n\`\`\`\n${excerpt}\n\`\`\`\n\n## Outcome\n\npending — written before the pass ran (write-before-act).\n`,
  );
  stdout(`heal: prompt-log entry ${path}\n`);
  return path;
}

function recordOutcome(path, outcome) {
  writeFileSync(path, readFileSync(path, "utf8").replace(/## Outcome\n[\s\S]*$/, `## Outcome\n\n${outcome}\n`));
}

// --- the loop -------------------------------------------------------------------
const cfg = loadConfig();
const mech = cfg.selfHealing?.mechanical ?? { enabled: true, maxPasses: 2 };
const agentCfg = cfg.selfHealing?.agent ?? { enabled: false, maxPasses: 2, commandEnv: "PROTO_FORGE_HEAL_AGENT" };

let mechanicalPasses = 0;
let agentPasses = 0;
let lastEntry = null;

function healedExit(tier, gate, pass) {
  stdout(`✓ heal: gate "${gate}" healed by the ${tier} tier in pass ${pass} — the full verify confirms green\n`);
  process.exit(0);
}

function blockedExit(gate) {
  stderr(`✗ heal: blocked — gate "${gate}" is still red\n`);
  stderr(`    passes attempted: ${mechanicalPasses} mechanical, ${agentPasses} agent\n`);
  stderr(`    last prompt-log entry: ${lastEntry ?? "none — no tier applied"}\n`);
  stderr("    An operator or CI acts on this report; the generation pipeline, not this tool,\n");
  stderr('    stamps gates[].result = "blocked" into the snapshot (a consent act).\n');
  process.exit(1);
}

const first = runVerify();
if (first.code === 0) {
  stdout("✓ heal: verify is green — nothing to heal\n");
  process.exit(0);
}

let { gate, script } = parseFailingGate(first.out);
let excerpt = excerptOf(first.out);
stdout(`heal: failing gate is ${gate}\n`);
if (isHardStop(gate, excerpt)) hardStopExit(gate);

// --- Tier 1: mechanical ---------------------------------------------------------
if (mech.enabled !== false) {
  let pass = 0;
  while (pass < (mech.maxPasses ?? 2)) {
    const entry = registry[gate];
    if (entry === undefined) {
      stdout(`heal: no mechanical recipe for gate "${gate}" — the registry heals derivations, not decisions\n`);
      break;
    }
    if (entry.requiresPath !== undefined && !existsSync(entry.requiresPath)) {
      stdout(`heal: gate "${gate}" lacks the mechanical signature (${entry.requiresPath} is absent) — this failure is semantic, not stale\n`);
      break;
    }
    if (entry.outputMatch !== undefined && !new RegExp(entry.outputMatch).test(excerpt)) {
      stdout(`heal: gate "${gate}" fails for a reason the mechanical entry does not cover (no /${entry.outputMatch}/ in its output)\n`);
      break;
    }
    pass += 1;
    mechanicalPasses += 1;
    lastEntry = writePromptEntry(
      gate,
      pass,
      `Tier 1 (mechanical) heal of gate "${gate}", pass ${pass}/${mech.maxPasses ?? 2}: run \`${entry.regen.join("` then `")}\`, then re-run the gate.\nWhy this is mechanical: ${entry.reason}.`,
      excerpt,
    );
    stdout(`heal: tier 1 pass ${pass}/${mech.maxPasses ?? 2} — ${entry.regen.join(" && ")}\n`);
    let regenFailed = null;
    for (const cmd of entry.regen) {
      if (cmd.startsWith("rm:")) {
        rmSync(cmd.slice("rm:".length), { recursive: true, force: true });
        continue;
      }
      const r = runCmd(cmd);
      if (r.code !== 0) {
        regenFailed = cmd;
        stderr(`heal: regen command failed — ${cmd}\n${tail(r.out, 20)}\n`);
        break;
      }
    }
    if (regenFailed !== null) {
      recordOutcome(lastEntry, `not healed — the regen command failed: \`${regenFailed}\`.`);
      continue;
    }
    const g = runGate(entry.check ?? script);
    if (g.code !== 0) {
      excerpt = excerptOf(g.out);
      recordOutcome(lastEntry, `not healed — gate "${gate}" is still red after the regeneration.`);
      continue;
    }
    const confirm = runVerify();
    if (confirm.code === 0) {
      recordOutcome(lastEntry, `healed — gate "${gate}" green, the full verify confirms.`);
      healedExit("mechanical", gate, pass);
    }
    const next = parseFailingGate(confirm.out);
    recordOutcome(lastEntry, `partial — gate "${gate}" went green but the confirming verify fails at "${next.gate}".`);
    ({ gate, script } = next);
    excerpt = excerptOf(confirm.out);
    stdout(`heal: failing gate is ${gate}\n`);
    if (isHardStop(gate, excerpt)) hardStopExit(gate);
  }
}

// --- Tier 2: agent ----------------------------------------------------------------
if (isHardStop(gate, excerpt)) hardStopExit(gate); // the door is checked again at the tier boundary
if (agentCfg.enabled !== true) {
  stderr("heal: the agent tier is off — selfHealing.agent.enabled is not true in the committed config.\n");
  stderr("    Committing that flag IS the operator's standing consent (the autoPropagate precedent):\n");
  stderr("    it went through review to get there, which a flag typed in the moment never does.\n");
  stderr("    Set selfHealing.agent.enabled = true in .proto-forge/config.json to consent.\n");
  blockedExit(gate);
}

const RULES =
  "A fix pass may only add tests/translations/testids/docs or fix the flagged line — " +
  "never lower a threshold, delete an assertion, add an identical-ok entry, or waive a gate.";

for (let pass = 1; pass <= (agentCfg.maxPasses ?? 2); pass += 1) {
  const prompt =
    `\`pnpm verify\` fails at gate "${gate}". Fix the cause within the gate-failure rules, then stop.\n\n` +
    `Rules (SKILL.md gate-failure protocol, binding — guard hooks freeze the floors regardless): ${RULES}\n\n` +
    "Context: docs/TROUBLESHOOTING.md catalogues the known failure classes; `pnpm doctor` probes the machine preconditions.\n\n" +
    `Gate output (tail):\n\n${excerpt}\n`;
  agentPasses += 1;
  lastEntry = writePromptEntry(
    gate,
    pass,
    `Tier 2 (agent) heal of gate "${gate}", pass ${pass}/${agentCfg.maxPasses ?? 2}: dispatch the configured agent with the bounded prompt below, then re-run the gate.\n\n--- agent prompt ---\n\n${prompt}`,
    excerpt,
  );
  // The runner comes from the env var the config NAMES (the tokenEnv pattern) —
  // never a command string in config. Unset falls back to the claude CLI.
  const custom = agentCfg.commandEnv !== undefined && agentCfg.commandEnv !== "" ? process.env[agentCfg.commandEnv] : undefined;
  const argv = custom !== undefined && custom !== ""
    ? [...custom.split(/\s+/).filter((p) => p !== ""), prompt]
    : ["claude", "-p", prompt, "--permission-mode", "acceptEdits"];
  stdout(`heal: tier 2 pass ${pass}/${agentCfg.maxPasses ?? 2} — dispatching ${argv[0]}\n`);
  const r = spawnSync(argv[0], argv.slice(1), { stdio: "inherit" });
  if (r.error !== undefined && r.error.code === "ENOENT") {
    stderr(`heal: "${argv[0]}" is not on PATH — skipping the agent tier (name a runner via the ${agentCfg.commandEnv || "PROTO_FORGE_HEAL_AGENT"} env var to enable it here)\n`);
    recordOutcome(lastEntry, `not run — the agent binary "${argv[0]}" is absent.`);
    break;
  }
  const g = runGate(script);
  if (g.code === 0) {
    const confirm = runVerify();
    if (confirm.code === 0) {
      recordOutcome(lastEntry, `healed — gate "${gate}" green, the full verify confirms.`);
      healedExit("agent", gate, pass);
    }
    const next = parseFailingGate(confirm.out);
    recordOutcome(lastEntry, `partial — gate "${gate}" went green but the confirming verify fails at "${next.gate}".`);
    ({ gate, script } = next);
    excerpt = excerptOf(confirm.out);
    stdout(`heal: failing gate is ${gate}\n`);
    if (isHardStop(gate, excerpt)) hardStopExit(gate);
  } else {
    excerpt = excerptOf(g.out);
    recordOutcome(lastEntry, `not healed — gate "${gate}" is still red after the agent pass.`);
  }
}

// --- Tier 3: escalate -------------------------------------------------------------
blockedExit(gate);

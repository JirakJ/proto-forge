import { existsSync, readFileSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { fail, note, ok } from "./lib.mjs";

// @adr 001 - configurable gates with waiver-gated relaxation (e2e edition)
// The configuration layer every gate reads. Three sources, later wins:
//   1. DEFAULTS below              (strict; what a fresh suite gets)
//   2. ~/.config/proto-forge/config.json   (operator's machine-wide preference)
//   3. .proto-forge/config.json            (this repo, committed)
// PROTO_FORGE_CONFIG overrides (3) for one-off runs.
//
// The asymmetry is deliberate (BR-17): TIGHTENING a gate is free, RELAXING a
// mandatory one is not. Turning any gate in MANDATORY_GATES below "error"
// requires a matching entry in `waivers[]` carrying a reason, an ADR number and
// an expiry date. Without it `config:check` fails; with it the run is stamped
// conformance:"waived" and the relaxation is printed on every single verify,
// then expires by itself.
//
// No integrations surface here: cross-repo sync belongs to the WORKSPACE repo,
// this part only carries suites. The guardrails stay — the hooks read them.

export const MANDATORY_GATES = ["registry", "stub", "snapshot", "status"];

const MODES = ["error", "warn", "off"];

export const DEFAULTS = {
  policy: "strict",
  gates: {
    registry: { mode: "error" },
    stub: { mode: "error" },
    snapshot: { mode: "error" },
    adr: { mode: "error" },
    prompt: { mode: "error" },
    status: { mode: "error" },
  },
  guardrails: {
    // No gate, script or hook opens a socket unless this says so, and then only
    // to a host on the allowlist. test:e2e is OUTSIDE verify and outside this
    // rule by design — a runtime suite exists to contact the pair.
    network: { allow: false, allowedHosts: [] },
    requireApproval: [],
    // Paths a hook refuses to let an agent edit: the locks, the append-only log,
    // and the gate corpus — scripts/ is this template's byte-pinned seed.
    protectedPaths: [
      ".proto-forge/seed.lock",
      ".proto-forge/snapshot.json",
      ".prompts/**",
      // The model registry is a byte-identical copy of the plugin's (NFR-31): edited there, never here.
      ".proto-forge/models.json",
      "scripts/**",
    ],
    // Threshold-lowering edits a hook refuses regardless of who asks.
    freezeThresholds: true,
  },
  // Tiered self-healing for a red `pnpm verify` (NFR-19): layered, bounded, on
  // the record. `pnpm heal` reads this block; hard-stop gates never enter any
  // tier and every pass is prompt-logged before it acts.
  selfHealing: {
    // Tier 1 — deterministic regenerations from the HEALING REGISTRY in
    // scripts/heal.mjs (here: the STATUS block only — the registries themselves
    // are decisions). Derivations only: no floor moves, no consent act runs.
    mechanical: { enabled: true, maxPasses: 2 },
    // Tier 2 — a bounded agent pass. Standing consent for an UNATTENDED agent
    // fix loop — the heal analogue of autoPropagate: committing enabled:true IS
    // the operator's reviewed consent, and it consents to the bounded loop and
    // nothing else (hard-stop gates stay out; guard hooks keep freezing
    // floors). commandEnv names an env var holding the runner executable — the
    // tokenEnv pattern, never a command string in config.
    agent: { enabled: false, maxPasses: 2, commandEnv: "PROTO_FORGE_HEAL_AGENT" },
    // The CI half of the consent: heal.yml also requires the repository
    // variable HEAL_ENABLED — both doors are explicit, reviewable acts.
    ci: { enabled: false },
  },
  waivers: [],
};

const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

function merge(base, override) {
  const out = { ...base };
  for (const [k, v] of Object.entries(override)) {
    out[k] = isObject(v) && isObject(base[k]) ? merge(base[k], v) : v;
  }
  return out;
}

const readJson = (p) => JSON.parse(readFileSync(p, "utf8"));

export function configSources() {
  const user = join(homedir(), ".config", "proto-forge", "config.json");
  const project = process.env.PROTO_FORGE_CONFIG ?? join(".proto-forge", "config.json");
  return [user, project].filter((p) => existsSync(p));
}

let cached;
export function loadConfig() {
  if (cached) return cached;
  cached = configSources().reduce((acc, p) => merge(acc, readJson(p)), DEFAULTS);
  return cached;
}

/** Today as YYYY-MM-DD, overridable so `config:check` is testable and reproducible. */
export const today = () => process.env.PROTO_FORGE_TODAY ?? new Date().toISOString().slice(0, 10);

/** Waivers that are well-formed AND still in date. */
export function activeWaivers(cfg = loadConfig()) {
  const now = today();
  return (cfg.waivers ?? []).filter((w) => w.expires >= now);
}

/**
 * The mode a gate actually runs in. A relaxation without a live waiver is
 * ignored — the gate snaps back to "error" — so a stale config cannot silently
 * weaken the build between `config:check` runs.
 */
export function gateMode(name, cfg = loadConfig()) {
  const configured = cfg.gates?.[name]?.mode ?? "error";
  if (!MANDATORY_GATES.includes(name)) return configured;
  if (configured === "error") return "error";
  const waived = activeWaivers(cfg).some((w) => w.gate === name);
  return waived ? configured : "error";
}

/** Gate-level options, with the strict defaults filled in. */
export function gateOptions(name, cfg = loadConfig()) {
  return { ...DEFAULTS.gates[name], ...(cfg.gates?.[name] ?? {}) };
}

/**
 * Single exit path for every gate, so `mode` is honoured identically everywhere:
 * error → non-zero exit, warn → findings on stderr and a pass, off → one loud line.
 */
export function gateResult(name, okMessage, errors) {
  if (errors.length === 0) return ok(okMessage);
  const mode = gateMode(name);
  if (mode === "off") return note(`${name}: gate disabled by config — ${errors.length} finding(s) NOT enforced`);
  if (mode === "warn") {
    note(`${name} WARNED (${errors.length} finding(s), waived to "warn")`);
    for (const e of errors) process.stderr.write(`    ${e}\n`);
    return;
  }
  fail(`${name} FAILED`, errors);
}

// A value that is a credential (or a command) is not a NAME for one. An env
// var name is SCREAMING_SNAKE; anything else pasted into a *Env field is
// almost certainly the value itself.
const ENV_NAME = /^[A-Z][A-Z0-9_]*$/;

/** Every `*Env` value anywhere in the given subtree must be an env var NAME, never a value. */
function checkEnvVarNames(node, path, errors) {
  if (!isObject(node)) return;
  for (const [k, v] of Object.entries(node)) {
    if (k.endsWith("Env") && typeof v === "string" && v !== "" && !ENV_NAME.test(v)) {
      errors.push(`${path}.${k}: ${JSON.stringify(v)} — this looks like a value, not an env var name`);
    }
    if (isObject(v)) checkEnvVarNames(v, `${path}.${k}`, errors);
  }
}

/** The selfHealing half of checkConfig — a loop nobody bounded is not a tool. */
function checkSelfHealing(cfg, errors, warnings) {
  const healing = cfg.selfHealing ?? {};
  for (const tier of ["mechanical", "agent"]) {
    const passes = healing[tier]?.maxPasses;
    if (passes === undefined) continue;
    if (!Number.isInteger(passes) || passes < 1 || passes > 5) {
      errors.push(
        `selfHealing.${tier}.maxPasses must be an integer between 1 and 5 — ` +
          `a healing loop without a bound is a loop, got ${JSON.stringify(passes)}`,
      );
    }
  }
  // commandEnv names an env var (BR-29's door) — checkEnvVarNames rejects a
  // pasted command the same way it rejects a pasted credential.
  checkEnvVarNames(healing, "selfHealing", errors);
  if (healing.agent?.enabled === true && healing.mechanical?.enabled === false) {
    warnings.push(
      "selfHealing.agent.enabled is on while selfHealing.mechanical is off — the agent tier " +
        "will field drifts a regeneration would have fixed for free (odd but legal)",
    );
  }
}

/** Validates the merged config itself. Used by `pnpm config:check` and by verify. */
export function checkConfig(cfg = loadConfig()) {
  const errors = [];
  const warnings = [];
  const now = today();
  const known = Object.keys(DEFAULTS.gates);

  for (const [name, g] of Object.entries(cfg.gates ?? {})) {
    if (!known.includes(name)) errors.push(`unknown gate "${name}" — known gates: ${known.join(", ")}`);
    if (!MODES.includes(g.mode)) errors.push(`gate "${name}": mode must be one of ${MODES.join("|")}, got ${JSON.stringify(g.mode)}`);
  }

  const waivers = cfg.waivers ?? [];
  const seen = new Set();
  for (const [i, w] of waivers.entries()) {
    const at = `waivers[${i}]`;
    for (const field of ["gate", "reason", "adr", "expires"]) {
      if (w[field] === undefined || w[field] === "") errors.push(`${at}: missing required field "${field}"`);
    }
    if (w.gate !== undefined && !known.includes(w.gate)) errors.push(`${at}: unknown gate "${w.gate}"`);
    if (w.expires !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(String(w.expires))) {
      errors.push(`${at}: "expires" must be YYYY-MM-DD, got ${JSON.stringify(w.expires)}`);
    }
    if (typeof w.reason === "string" && w.reason.trim().length < 15) {
      errors.push(`${at}: "reason" must actually explain the relaxation (>=15 chars)`);
    }
    if (w.adr !== undefined) {
      const padded = String(w.adr).padStart(3, "0");
      if (!existsSync("docs/adr")) {
        warnings.push(`${at}: no docs/adr directory to validate ADR ${padded} against`);
      } else if (!readdirSync("docs/adr").some((f) => f.startsWith(`${padded}-`))) {
        errors.push(`${at}: ADR ${padded} does not exist — a waiver must be a recorded decision`);
      }
    }
    if (w.gate !== undefined && seen.has(w.gate)) errors.push(`${at}: duplicate waiver for gate "${w.gate}"`);
    seen.add(w.gate);

    // A waiver for a gate that is already at "error" is dead paperwork: it reads
    // as "this is relaxed" when nothing is. Fail so the file stays truthful.
    if (w.gate !== undefined && (cfg.gates?.[w.gate]?.mode ?? "error") === "error") {
      errors.push(`${at}: gate "${w.gate}" runs at "error" — remove the stale waiver`);
    }
    if (w.expires !== undefined && String(w.expires) < now) {
      warnings.push(`${at}: waiver for "${w.gate}" expired on ${w.expires} — gate is back at "error"`);
    }
  }

  checkSelfHealing(cfg, errors, warnings);

  // The other half: a mandatory gate relaxed WITHOUT a waiver is a hard error.
  for (const name of MANDATORY_GATES) {
    const configured = cfg.gates?.[name]?.mode ?? "error";
    if (configured === "error") continue;
    if (!waivers.some((w) => w.gate === name)) {
      errors.push(
        `gate "${name}" is mandatory and set to "${configured}" with no waiver — ` +
          `add { gate: "${name}", reason, adr, expires } to waivers[] or set it back to "error"`,
      );
    }
  }

  const live = activeWaivers(cfg);
  return { errors, warnings, conformance: live.length === 0 ? "strict" : "waived", waivers: live };
}

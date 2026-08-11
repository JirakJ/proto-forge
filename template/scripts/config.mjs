import { existsSync, readFileSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { fail, note, ok } from "./lib.mjs";

// @adr 009 - configurable gates with waiver-gated relaxation
// The configuration layer every gate reads. Three sources, later wins:
//   1. DEFAULTS below              (strict; what a fresh prototype gets)
//   2. ~/.config/proto-forge/config.json   (operator's machine-wide preference)
//   3. .proto-forge/config.json            (this prototype, committed)
// PROTO_FORGE_CONFIG overrides (3) for one-off runs.
//
// The asymmetry is deliberate (BR-17): TIGHTENING a gate is free, RELAXING a
// mandatory one is not. Turning i18n/testid/layer/docs/security/stub/consistency/
// snapshot below "error" requires a matching entry in `waivers[]` carrying a
// reason, an ADR number and an expiry date. Without it `config:check` fails; with
// it the run is stamped conformance:"waived" and the relaxation is printed on
// every single verify, then expires by itself. That way "everything is
// configurable" never quietly becomes "nothing is enforced".

export const MANDATORY_GATES = [
  "i18n",
  "testid",
  "layer",
  "docs",
  "security",
  "stub",
  "consistency",
  "snapshot",
];

const MODES = ["error", "warn", "off"];

export const DEFAULTS = {
  policy: "strict",
  gates: {
    i18n: {
      mode: "error",
      // Every locale must be fully translated, not merely present.
      requireTranslated: true,
      // A value byte-identical to the default locale means nobody translated it.
      allowIdenticalToDefault: false,
      // A key in the catalogue that no code uses is dead weight.
      failOnOrphanKeys: true,
      // t(`x.${y}`) dodges every static check — declare the keys instead.
      failOnDynamicKeys: true,
      // Plural categories must match what the locale's grammar actually needs.
      requirePluralCompleteness: true,
    },
    testid: { mode: "error", scope: "semantic", requireUnique: true },
    layer: { mode: "error" },
    docs: { mode: "error", requireScreenshots: true, requireFreshScreenshots: true },
    security: { mode: "error" },
    stub: { mode: "error" },
    consistency: { mode: "error" },
    snapshot: { mode: "error" },
    budget: { mode: "error" },
    dup: { mode: "error" },
    adr: { mode: "error" },
    prompt: { mode: "error" },
  },
  integrations: {
    jira: {
      enabled: false,
      dryRun: true,
      baseUrl: "",
      projectKey: "",
      issueType: "Task",
      // Which pipeline events produce a ticket payload in the outbox.
      createFor: ["adr", "blocked-gate"],
      // Never inline a credential: this names an env var to read at --commit time.
      tokenEnv: "JIRA_API_TOKEN",
      userEnv: "JIRA_USER_EMAIL",
    },
    confluence: {
      enabled: false,
      dryRun: true,
      baseUrl: "",
      spaceKey: "",
      parentPageId: "",
      publish: ["architecture", "adr-index", "component-catalog"],
      tokenEnv: "CONFLUENCE_API_TOKEN",
      userEnv: "CONFLUENCE_USER_EMAIL",
    },
  },
  guardrails: {
    // No gate, script or hook opens a socket unless this says so, and then only
    // to a host on the allowlist. The integrations honour it at --commit time.
    network: { allow: false, allowedHosts: [] },
    // Outward-facing effects an operator must confirm interactively.
    requireApproval: ["jira.create", "confluence.publish"],
    // Paths a hook refuses to let an agent edit (the byte-pinned seed, the locks).
    protectedPaths: [
      "packages/proto-ui/**",
      ".proto-forge/seed.lock",
      ".proto-forge/snapshot.json",
      ".prompts/**",
    ],
    // Threshold-lowering edits a hook refuses regardless of who asks.
    freezeThresholds: true,
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

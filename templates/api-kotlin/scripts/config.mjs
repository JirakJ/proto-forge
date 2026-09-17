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
// mandatory one is not. Turning any gate in MANDATORY_GATES below "error"
// requires a matching entry in `waivers[]` carrying a
// reason, an ADR number and an expiry date. Without it `config:check` fails; with
// it the run is stamped conformance:"waived" and the relaxation is printed on
// every single verify, then expires by itself. That way "everything is
// configurable" never quietly becomes "nothing is enforced".

export const MANDATORY_GATES = [
  "arch",
  "contract",
  "errors",
  "migration",
  "opid",
  "docs",
  "security",
  "stub",
  "consistency",
  "snapshot",
  "coverage",
  "ignores",
  // "mutation" is deliberately NOT here: it is opt-in (ADR 003), and a gate that
  // is off by default cannot also be one a waiver is required to relax. The floor
  // it enforces is unchanged — see gates.mutation.enabled below.
  "external",
  "log",
  "deps",
  "env",
  "deploy",
  "status",
];

// The FAST LANE (BR-45): the per-iteration, per-feature-commit bar — unit tests
// with their coverage floors plus every offline structural and contract scan,
// in the full chain's relative order. It answers in minutes; the deep proofs
// (gate selftests, mutation, build, delivery surface, security scans, the
// conformance run, the measured status) stay in `pnpm verify`, which runs at
// each phase boundary, before release and in CI — never inside the feature
// loop. `config:check` pins package.json's `verify:fast` to exactly this list.
export const FAST_GATES = [
  "config:check",
  "lint",
  "typecheck",
  "coverage:policy",
  "ignores",
  "test:unit",
  "deps:budget",
  "arch:verify",
  "opid:scan",
  "log:scan",
  "error:catalog",
  "migration:verify",
  "contract:verify",
  "docs:verify",
  "stub:scan",
  "adr:lint",
  "prompt:lint",
  "dup:scan",
  "consistency",
  "snapshot:diff",
];

const MODES = ["error", "warn", "off"];

// The delivery chain, in promotion order. `local` is a developer convenience and
// never part of promotion; everything after it is a remote environment that
// exists ONLY by being declared here — values files, the docs table and the CD
// plan are all derived from (and checked against) this declaration.
export const ENV_ORDER = ["local", "dev", "sit", "uat", "test", "prod"];
export const REMOTE_ENVS = ENV_ORDER.slice(1);

/** The enabled remote environments, in ENV_ORDER — the promotion chain a release walks. */
export function promotionChain(cfg = loadConfig()) {
  return REMOTE_ENVS.filter((e) => cfg.environments?.[e]?.enabled === true);
}

// Every remote environment carries the same shape so enabling one is a config
// diff, never a schema change. `*Env` fields name environment VARIABLES — the
// config never holds a credential, only the name of where one lives at deploy
// time (same doctrine as integrations.*.tokenEnv).
const remoteEnvDefaults = (over = {}) => ({
  enabled: false,
  url: "",
  cluster: { type: "generic", server: "", namespace: "", registry: "" },
  approval: "required",
  // Standing consent for an UNATTENDED operator deploy to this env — the
  // deploy analogue of integrations.*.autoPropagate: it stands in for the
  // per-run --approve of an operator deploy and for nothing else. CI promotion
  // consent is the committed workflow plus GitHub environment reviewers.
  autoDeploy: false,
  auth: {
    method: "kubeconfig",
    tokenEnv: "KUBE_TOKEN",
    kubeconfigEnv: "KUBECONFIG",
    azureClientIdEnv: "AZURE_CLIENT_ID",
    azureTenantIdEnv: "AZURE_TENANT_ID",
    azureSubscriptionIdEnv: "AZURE_SUBSCRIPTION_ID",
  },
  ...over,
});

export const DEFAULTS = {
  policy: "strict",
  gates: {
    arch: { mode: "error" },
    contract: { mode: "error" },
    errors: { mode: "error" },
    migration: { mode: "error" },
    opid: { mode: "error" },
    docs: { mode: "error" },
    security: { mode: "error" },
    stub: { mode: "error" },
    consistency: { mode: "error" },
    snapshot: { mode: "error" },
    coverage: { mode: "error" },
    ignores: { mode: "error" },
    // Opt-in (ADR 003): the slowest tier in verify stays off until a committed
    // line turns it on. `mode` still governs how findings are reported when it runs.
    mutation: { mode: "error", enabled: false },
    external: { mode: "error" },
    log: { mode: "error" },
    deps: { mode: "error" },
    adr: { mode: "error" },
    prompt: { mode: "error" },
    dup: { mode: "error" },
    env: { mode: "error" },
    deploy: { mode: "error" },
    status: { mode: "error" },
  },
  // The single declaration every delivery artefact derives from. An environment
  // that is not enabled here has no values file, no docs-table row marked live
  // and no CD job — and env:verify fails when any of those exist anyway.
  // Progressive enablement: the template ships with only dev enabled; turning
  // on sit/uat/test/prod is a reviewed config diff, never a regeneration.
  environments: {
    local: { enabled: true, url: "http://localhost:8080" },
    dev: remoteEnvDefaults({
      enabled: true,
      approval: "none",
      // "dev" is a real namespace default, not a placeholder: point
      // cluster.server at a cluster and this is where the app lands.
      cluster: { type: "generic", server: "", namespace: "dev", registry: "" },
    }),
    sit: remoteEnvDefaults({ approval: "none" }),
    uat: remoteEnvDefaults(),
    test: remoteEnvDefaults(),
    prod: remoteEnvDefaults(),
  },
  // How the application ships. `helm` is the cluster path (dev and beyond);
  // `compose` is the single-host simple mode and cannot serve a multi-env chain.
  deployment: {
    flavor: "helm",
    imageRegistry: "",
    sign: true,
    scan: { image: true, severityThreshold: "high" },
    // NFR-30: the perf-smoke pipeline stage. Staged OFF for this stack until
    // its smoke story lands (docs/specs/2026-08-22-production-output-bar-design.md);
    // enabling it is one reviewed config line, never a workflow fork.
    perfSmoke: false,
    helm: { chartPath: "deploy/chart", keepHistory: 5 },
  },
  integrations: {
    jira: {
      enabled: false,
      dryRun: true,
      // Standing operator consent for UNATTENDED live writes: with autoPropagate on
      // (plus dryRun:false, the network allowlist and credentials), `pnpm sync:auto`
      // sends without a per-run --approve. Committing this flag to the repo IS the
      // recorded approval — it is visible in review, unlike a flag typed once.
      autoPropagate: false,
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
      autoPropagate: false,
      baseUrl: "",
      spaceKey: "",
      parentPageId: "",
      publish: ["architecture", "adr-index", "api-docs"],
      tokenEnv: "CONFLUENCE_API_TOKEN",
      userEnv: "CONFLUENCE_USER_EMAIL",
    },
  },
  guardrails: {
    // No gate, script or hook opens a socket unless this says so, and then only
    // to a host on the allowlist. The integrations honour it at --commit time.
    network: { allow: false, allowedHosts: [] },
    // Outward-facing effects an operator must confirm interactively. Deploys are
    // listed per environment so removing prod's door never removes dev's.
    requireApproval: [
      "jira.create",
      "confluence.publish",
      "deploy.dev",
      "deploy.sit",
      "deploy.uat",
      "deploy.test",
      "deploy.prod",
    ],
    // Paths a hook refuses to let an agent edit (the byte-pinned seed, the locks).
    // The platform kernel is this template's byte-pinned seed (BRS §17.2).
    protectedPaths: [
      "src/main/kotlin/app/platform/**",
      ".proto-forge/seed.lock",
      ".proto-forge/snapshot.json",
      ".prompts/**",
      // The model registry is a byte-identical copy of the plugin's (NFR-31): edited there, never here.
      ".proto-forge/models.json",
    ],
    // Threshold-lowering edits a hook refuses regardless of who asks.
    freezeThresholds: true,
  },
  // Tiered self-healing for a red `pnpm verify` (NFR-19): layered, bounded, on
  // the record. `pnpm heal` reads this block; hard-stop gates never enter any
  // tier and every pass is prompt-logged before it acts.
  selfHealing: {
    // Tier 1 — deterministic regenerations from the HEALING REGISTRY in
    // scripts/heal.mjs. Derivations only: no floor moves, no consent act runs.
    mechanical: { enabled: true, maxPasses: 2 },
    // Tier 2 — a bounded agent pass. Standing consent for an UNATTENDED agent
    // fix loop — the heal analogue of autoPropagate/autoDeploy: committing
    // enabled:true IS the operator's reviewed consent, and it consents to the
    // bounded loop and nothing else (hard-stop gates stay out; guard hooks
    // keep freezing floors). commandEnv names an env var holding the runner
    // executable — the tokenEnv pattern, never a command string in config.
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

// A value that is a credential is not a NAME for one. The pattern is the
// mechanical half of "no secrets in config": an env var name is SCREAMING_SNAKE,
// and anything else pasted into a *Env field is almost certainly the secret itself.
const ENV_NAME = /^[A-Z][A-Z0-9_]*$/;

/** Every `*Env` value anywhere in the config must be an env var NAME, never a value. */
function checkEnvVarNames(node, path, errors) {
  if (!isObject(node)) return;
  for (const [k, v] of Object.entries(node)) {
    if (k.endsWith("Env") && typeof v === "string" && v !== "" && !ENV_NAME.test(v)) {
      errors.push(`${path}.${k}: ${JSON.stringify(v)} — this looks like a value, not an env var name`);
    }
    if (isObject(v)) checkEnvVarNames(v, `${path}.${k}`, errors);
  }
}

/** The environments/deployment half of checkConfig — the delivery declaration. */
function checkEnvironments(cfg, errors, warnings) {
  const envs = cfg.environments ?? {};
  const deployment = cfg.deployment ?? {};

  for (const name of Object.keys(envs)) {
    if (!ENV_ORDER.includes(name)) {
      errors.push(`unknown environment "${name}" — the chain is fixed: ${ENV_ORDER.join(", ")}`);
    }
  }

  // local is where the prototype actually runs; a config that disables it
  // describes a project nobody can start.
  if (envs.local?.enabled !== true) errors.push("environments.local is not optional — local must stay enabled");

  const enabledRemote = REMOTE_ENVS.filter((e) => envs[e]?.enabled === true);

  for (const name of enabledRemote) {
    const env = envs[name];
    const cluster = env.cluster ?? {};
    if (!cluster.namespace) {
      errors.push(`environments.${name} is enabled but cluster.namespace is empty — an environment is a namespace on a cluster, name it`);
    }
    if (!["openshift", "aks", "generic"].includes(cluster.type)) {
      errors.push(`environments.${name}.cluster.type must be openshift|aks|generic, got ${JSON.stringify(cluster.type)}`);
    }
    if (!["none", "required"].includes(env.approval)) {
      errors.push(`environments.${name}.approval must be none|required, got ${JSON.stringify(env.approval)}`);
    }
    if (env.auth !== undefined && !["oidc", "token", "kubeconfig"].includes(env.auth.method)) {
      errors.push(`environments.${name}.auth.method must be oidc|token|kubeconfig, got ${JSON.stringify(env.auth.method)}`);
    }
    if (!env.url) warnings.push(`environments.${name} is enabled with an empty url — the smoke test has no target yet`);
    if (cluster.server) {
      let host = null;
      try {
        host = new URL(cluster.server).hostname;
      } catch {
        errors.push(`environments.${name}.cluster.server ${JSON.stringify(cluster.server)} is not a URL`);
      }
      const allowed = cfg.guardrails?.network?.allowedHosts ?? [];
      if (host !== null && !allowed.some((a) => host === a || host.endsWith(`.${a}`))) {
        warnings.push(
          `environments.${name}.cluster.server host "${host}" is not on guardrails.network.allowedHosts — ` +
            "operator deploys to it will be refused until it is",
        );
      }
    }
  }

  // A chain that STARTS at prod has no environment to have proven the release in.
  if (envs.prod?.enabled === true && enabledRemote[0] === "prod") {
    errors.push("prod cannot be the first environment — enable at least one pre-prod environment (dev, sit, uat or test) first");
  }
  if (envs.prod?.enabled === true && envs.prod.approval === "none") {
    errors.push('environments.prod.approval is "none" — a prod deploy nobody approved is not a policy, it is an accident');
  }
  for (const name of ["uat", "test"]) {
    if (envs[name]?.enabled === true && envs[name].approval === "none") {
      warnings.push(`environments.${name}.approval is "none" — ${name} usually carries sign-off; confirm this is deliberate`);
    }
  }

  checkEnvVarNames(envs, "environments", errors);
  checkEnvVarNames(cfg.integrations ?? {}, "integrations", errors);

  if (!["helm", "compose"].includes(deployment.flavor)) {
    errors.push(`deployment.flavor must be helm|compose, got ${JSON.stringify(deployment.flavor)}`);
  }
  if (deployment.flavor === "compose" && enabledRemote.some((e) => e !== "dev")) {
    errors.push(
      "deployment.flavor \"compose\" cannot serve a multi-environment chain — " +
        "compose is the single-host simple mode; switch to helm before enabling sit/uat/test/prod",
    );
  }
  if (deployment.scan !== undefined && !["critical", "high", "medium"].includes(deployment.scan.severityThreshold)) {
    errors.push(`deployment.scan.severityThreshold must be critical|high|medium, got ${JSON.stringify(deployment.scan.severityThreshold)}`);
  }
  const keep = deployment.helm?.keepHistory;
  if (keep !== undefined && (!Number.isInteger(keep) || keep < 2)) {
    errors.push(`deployment.helm.keepHistory must be an integer >= 2 (a rollback needs a release to roll back to), got ${JSON.stringify(keep)}`);
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

  checkEnvironments(cfg, errors, warnings);
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

import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { parse } from "yaml";
import { REMOTE_ENVS, loadConfig } from "./config.mjs";
import { OUTBOX } from "./outbox.mjs";
import { fail, walk } from "./lib.mjs";

// @adr 200 - a deploy is consented, staged-first and environment-scoped (BR-28)
// assertMayDeploy is assertMayCommit's mirror, door for door. Same shape on
// purpose: an operator who has read one guardrail has read both, and a door
// added to one side is visibly missing from the other.
//
//   assertMayCommit                     assertMayDeploy
//   1. integration.enabled              1. environment declared + enabled
//   2. dryRun → outbox only             2. staged-first → a render in the outbox
//   3. baseUrl is set                   3. cluster.server is set
//   4. network guardrail + allowlist    4. network guardrail + allowlist
//   5. --approve / autoPropagate        5. --approve / autoDeploy
//   6. credentials by NAME, from env    6. auth env vars by NAME, from env
//
// Plus one door commits have no analogue for: the current kubectl context.
// helm and kubectl act on whatever context the shell happens to carry, so the
// mutating actions compare that context's server (and pinned namespace)
// against the config and refuse a foreign one — "right command, wrong cluster"
// is the deploy mistake that hurts the most.

export const deployOutbox = (envName) => join(OUTBOX, `deploy-${envName}`);

/** Everything staged for an environment — the artefacts a --commit would replay. */
export function stagedFiles(envName) {
  return walk(deployOutbox(envName)).sort();
}

const hostAllowed = (host, allowed) => allowed.some((a) => host === a || host.endsWith(`.${a}`));

/** The env var NAMES a login for this environment reads — never values (BR-29). */
export function authEnvNames(env) {
  const auth = env.auth ?? {};
  if (auth.method === "oidc") {
    return [auth.azureClientIdEnv, auth.azureTenantIdEnv, auth.azureSubscriptionIdEnv].filter(Boolean);
  }
  if (auth.method === "token") return [auth.tokenEnv].filter(Boolean);
  return [auth.kubeconfigEnv].filter(Boolean);
}

// Door 1 — the target exists by declaration, and is enabled.
export function assertDeclared(envName, cfg = loadConfig()) {
  if (!REMOTE_ENVS.includes(envName)) {
    fail(`unknown environment "${envName}"`, [`Remote environments are fixed: ${REMOTE_ENVS.join(", ")}.`]);
  }
  const env = cfg.environments?.[envName];
  if (env?.enabled !== true) {
    fail(`environments.${envName} is disabled`, [
      `Set environments.${envName}.enabled = true in .proto-forge/config.json — a reviewed diff, plus its values file.`,
    ]);
  }
  return env;
}

// Door 3 — a named target.
function assertTarget(envName, env) {
  const server = env.cluster?.server ?? "";
  if (server === "") {
    fail(`environments.${envName}.cluster.server is not set`, [
      "A deploy with no declared server would go wherever the current context points — name the cluster first.",
    ]);
  }
  try {
    return { server, host: new URL(server).hostname };
  } catch {
    fail(`environments.${envName}.cluster.server ${JSON.stringify(server)} is not a URL`);
  }
}

// Door 4 — the network guardrail, same wording as the integrations door.
function assertNetwork(host, rails) {
  if (!rails.network?.allow) {
    fail("network access is disabled by guardrails.network.allow", [
      `Set guardrails.network = { "allow": true, "allowedHosts": ["${host}"] } to permit exactly this host.`,
    ]);
  }
  const allowed = rails.network.allowedHosts ?? [];
  if (allowed.length > 0 && !hostAllowed(host, allowed)) {
    fail(`${host} is not on guardrails.network.allowedHosts`, [`allowed: ${allowed.join(", ")}`]);
  }
}

/**
 * Doors 1 + 3 + 4 — what a read-only, socket-opening action (check, diff,
 * status) must clear. No staging, no approval: reading a cluster changes
 * nothing, but it is still network traffic the guardrail governs.
 */
export function assertReadOnlyAccess(envName, cfg = loadConfig()) {
  const env = assertDeclared(envName, cfg);
  const { server, host } = assertTarget(envName, env);
  assertNetwork(host, cfg.guardrails ?? {});
  return { env, server, host };
}

/**
 * Everything that must be true before a mutating cluster action. Ordered
 * cheapest-first, and each failure says what to change — the assertMayCommit
 * doctrine, applied to deploys. `render: false` is for actions whose staged
 * artefact is not a fresh render (rollback replays the release history helm
 * already keeps).
 */
export function assertMayDeploy(envName, action, { render = true } = {}, cfg = loadConfig()) {
  const env = assertDeclared(envName, cfg);

  // Door 2 — staged-first. A --commit replays files an operator has had the
  // chance to read, exactly as sync --commit replays the outbox payloads.
  if (render && stagedFiles(envName).length === 0) {
    fail(`nothing is staged for ${envName}`, [
      `Deploys are staged-first: run pnpm env:remote render --env ${envName},`,
      `review ${deployOutbox(envName)}/, then re-run with --commit.`,
    ]);
  }

  const { server, host } = assertTarget(envName, env);
  assertNetwork(host, cfg.guardrails ?? {});

  // Door 5 — approval. --approve is per-run consent typed by the operator.
  // environments.<env>.autoDeploy in the COMMITTED config is standing consent
  // (the deploy analogue of autoPropagate): it went through review to get
  // there, it is scoped to exactly one environment, and it stands in for
  // --approve and for nothing else — every other door still holds.
  const standingApproval = env.autoDeploy === true;
  if ((cfg.guardrails?.requireApproval ?? []).includes(action) && !process.argv.includes("--approve") && !standingApproval) {
    fail(`"${action}" requires explicit approval`, [
      "This changes an environment other people use. Re-run with --approve once you have reviewed the staged files,",
      `set environments.${envName}.autoDeploy = true for standing, reviewed consent,`,
      `or remove "${action}" from guardrails.requireApproval.`,
    ]);
  }

  // Door 6 — credentials, by NAME. The config names env vars; the values must
  // be present at commit time and never anywhere else.
  for (const name of authEnvNames(env)) {
    const value = process.env[name];
    if (value === undefined || value === "") fail(`${name} is not set in the environment`);
  }

  return { env, host, server };
}

/**
 * The facts `kubectl config view --minify` would print — current context name,
 * its cluster server and its pinned namespace — read straight from the
 * kubeconfig so the check works (and is testable) without kubectl installed.
 * KUBECONFIG's first path wins, matching kubectl's precedence for writes.
 */
export function currentContext() {
  const first = (process.env.KUBECONFIG ?? "").split(":").filter((p) => p !== "")[0];
  const path = first !== undefined ? resolve(first) : join(homedir(), ".kube", "config");
  if (!existsSync(path)) return null;
  let doc;
  try {
    doc = parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
  const name = doc?.["current-context"];
  const ctx = (doc?.contexts ?? []).find((c) => c?.name === name)?.context;
  if (ctx === undefined || ctx === null) return null;
  const cluster = (doc?.clusters ?? []).find((c) => c?.name === ctx.cluster)?.cluster;
  return { path, context: name, server: cluster?.server ?? "", namespace: ctx.namespace ?? "" };
}

/** True when the current kubectl context points at this environment's cluster. */
export function currentContextMatches(envName, cfg = loadConfig()) {
  const env = cfg.environments?.[envName] ?? {};
  const server = (env.cluster?.server ?? "").replace(/\/$/, "");
  const ctx = currentContext();
  if (ctx === null || ctx.server.replace(/\/$/, "") !== server) return false;
  const namespace = env.cluster?.namespace ?? "";
  return ctx.namespace === "" || ctx.namespace === namespace;
}

/** The refusing form: a mutating action calls this after the consent doors. */
export function assertContextMatches(envName, cfg = loadConfig()) {
  const env = cfg.environments?.[envName] ?? {};
  const server = (env.cluster?.server ?? "").replace(/\/$/, "");
  const ctx = currentContext();
  if (ctx === null) {
    fail("no kubectl context found", [
      "helm and kubectl act on the CURRENT context, so a deploy without one has no target.",
      `Log in to ${server || "the cluster"} first (oc login / az aks get-credentials / export KUBECONFIG).`,
    ]);
  }
  if (ctx.server.replace(/\/$/, "") !== server) {
    fail(`the current kubectl context points at ${ctx.server}, not environments.${envName}.cluster.server ${server}`, [
      `context: ${ctx.context} (${ctx.path})`,
      "Switch contexts before deploying — a deploy must never land on a cluster the config does not name.",
    ]);
  }
  const namespace = env.cluster?.namespace ?? "";
  if (ctx.namespace !== "" && ctx.namespace !== namespace) {
    fail(`the current kubectl context pins namespace "${ctx.namespace}", not environments.${envName}'s "${namespace}"`, [
      "Every command here passes -n explicitly, but a context aimed at another team's namespace is a wrong-cluster smell — switch or clear it.",
    ]);
  }
  return ctx;
}

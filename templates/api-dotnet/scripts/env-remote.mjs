import { execSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadConfig } from "./config.mjs";
import {
  assertContextMatches,
  assertDeclared,
  assertMayDeploy,
  assertReadOnlyAccess,
  authEnvNames,
  currentContextMatches,
  deployOutbox,
  stagedFiles,
} from "./deploy-lib.mjs";
import { fail, note, ok } from "./lib.mjs";

// @adr 200 - the operator's cluster tool: staged-first, consented, context-scoped
//   pnpm env:remote render --env dev              offline helm template → outbox
//   pnpm env:remote check|diff|status --env dev   read-only; network guardrail applies
//   pnpm env:remote bootstrap --env dev           stage namespace-setup skeletons
//   pnpm env:remote deploy --env dev --commit --approve
//   pnpm env:remote rollback --env dev --commit --approve [--revision N]
//
// Mutating actions walk assertMayDeploy's doors (deploy-lib.mjs, BR-28) and
// then refuse a kubectl context that does not point at the declared cluster.
// CI promotion never runs this script — cd.yml is its own consented path.
// One hard rule with no flag past it: Secret VALUES never leave an operator's
// hands through this tool. bootstrap stages skeletons and prints the create
// commands; it never applies a Secret, even with --commit --approve.

const argv = process.argv.slice(2);
const [command] = argv;
const argOf = (flag) => {
  const i = argv.indexOf(flag);
  return i === -1 ? undefined : argv[i + 1];
};
const commit = argv.includes("--commit");
const envName = argOf("--env");
const digest = argOf("--digest");
const imageOverride = argOf("--image");
const revision = argOf("--revision");

const cfg = loadConfig();
const CHART = cfg.deployment?.helm?.chartPath ?? "deploy/chart";
const KEEP = cfg.deployment?.helm?.keepHistory ?? 5;
const APP = (() => {
  try {
    return JSON.parse(readFileSync("package.json", "utf8")).name ?? "app";
  } catch {
    return "app";
  }
})();

const has = (cmd) => {
  try {
    execSync(`command -v ${cmd}`, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
};

/** Spawn a tool with the operator watching — argv arrays only, never a shell string. */
const live = (bin, args) => spawnSync(bin, args, { stdio: "inherit" }).status ?? 1;
const capture = (bin, args) => spawnSync(bin, args, { encoding: "utf8" });

const write = (s) => process.stdout.write(`${s}\n`);

const usage = () =>
  fail("usage: pnpm env:remote <check|render|diff|bootstrap|deploy|rollback|status> --env <name> [--commit] [--approve]", [
    "render stages an offline helm template into the outbox; deploy/rollback replay it with consent (BR-28).",
  ]);

if (!["check", "render", "diff", "bootstrap", "deploy", "rollback", "status"].includes(command ?? "")) usage();
if (envName === undefined || envName === "") usage();

const valuesFile = `${CHART}/values/${envName}.yaml`;
const requireValues = () => {
  if (!existsSync(valuesFile)) {
    fail(`${valuesFile} does not exist`, [
      "env:verify keeps enabled environments and values files in lockstep — add the file first.",
    ]);
  }
};
const requireTool = (tool, verb) => {
  if (!has(tool)) fail(`${tool} is not installed — ${verb}`);
};

// --- render: OFFLINE. helm template renders client-side; no socket opens. ------
function cmdRender() {
  assertDeclared(envName, cfg);
  requireValues();
  requireTool("helm", "render is an offline `helm template` and needs it");
  const args = ["template", APP, CHART, "-f", valuesFile];
  if (imageOverride !== undefined) args.push("--set", `image.repository=${imageOverride}`);
  if (digest !== undefined) args.push("--set", `image.digest=${digest}`);
  const r = capture("helm", args);
  if (r.status !== 0) fail(`helm template failed for ${envName}`, [String(r.stderr).trim()]);
  mkdirSync(deployOutbox(envName), { recursive: true });
  const file = join(deployOutbox(envName), "manifests.yaml");
  writeFileSync(file, r.stdout);
  const docs = r.stdout.split(/^---$/m).filter((d) => d.trim() !== "").length;
  ok(`render: ${docs} manifest(s) staged in ${file} — no cluster was touched`);
  write(`Review the render, then: pnpm env:remote deploy --env ${envName} --commit --approve`);
}

// --- check: read-only diagnosis; opening a socket is gated by the network rail --
function cmdCheck() {
  const { env, server } = assertReadOnlyAccess(envName, cfg);
  write(`environments.${envName}: cluster.type ${env.cluster?.type}, namespace ${env.cluster?.namespace}, server ${server}`);
  for (const name of authEnvNames(env)) {
    const present = process.env[name] !== undefined && process.env[name] !== "";
    write(`  auth env ${name}: ${present ? "set" : "NOT SET — export it before deploying"}`);
  }
  write(`  staged render: ${stagedFiles(envName).length > 0 ? deployOutbox(envName) : "none — run render first"}`);
  write(`  kubectl context: ${currentContextMatches(envName, cfg) ? "matches the declared server" : "does not match (log in / switch context)"}`);
  if (has("kubectl")) {
    const r = capture("kubectl", ["version", "--request-timeout=5s", "--output=yaml"]);
    write(`  cluster reachability: ${r.status === 0 ? "kubectl answers" : "NOT reachable from this context"}`);
  } else {
    note("kubectl not installed — skipping the reachability probe");
  }
  ok(`check: environments.${envName} declaration and guardrails are consistent`);
}

// --- diff: what the staged render would change; kubectl diff is server-side dry-run
function cmdDiff() {
  assertReadOnlyAccess(envName, cfg);
  const file = join(deployOutbox(envName), "manifests.yaml");
  if (!existsSync(file)) {
    fail(`nothing is staged for ${envName}`, [`Run pnpm env:remote render --env ${envName} first — diff compares the staged render.`]);
  }
  assertContextMatches(envName, cfg);
  requireTool("kubectl", "diff needs it");
  const code = live("kubectl", ["diff", "-f", file]);
  // kubectl diff exits 1 when differences exist — that is information, not an error.
  if (code > 1) fail(`kubectl diff failed for ${envName}`);
  ok(code === 0 ? `diff: ${envName} already matches the staged render` : `diff: differences shown above for ${envName}`);
}

// --- bootstrap: stage the namespace surface; apply on consent — except Secrets, ever
function cmdBootstrap() {
  const env = assertDeclared(envName, cfg);
  const ns = env.cluster?.namespace ?? envName;
  const meta = (name) => `  name: ${name}\n  namespace: ${ns}`;
  const skeletons = {
    "namespace.yaml": `apiVersion: v1\nkind: Namespace\nmetadata:\n  name: ${ns}\n`,
    "quota.yaml":
      `apiVersion: v1\nkind: ResourceQuota\nmetadata:\n${meta(`${APP}-quota`)}\nspec:\n  hard:\n` +
      `    requests.cpu: "2"\n    requests.memory: 2Gi\n    limits.cpu: "4"\n    limits.memory: 4Gi\n    pods: "10"\n`,
    "limitrange.yaml":
      `apiVersion: v1\nkind: LimitRange\nmetadata:\n${meta(`${APP}-limits`)}\nspec:\n  limits:\n` +
      `    - type: Container\n      default:\n        cpu: 250m\n        memory: 128Mi\n` +
      `      defaultRequest:\n        cpu: 50m\n        memory: 64Mi\n`,
    "networkpolicy.yaml":
      `# Default-deny ingress for the namespace; the chart's own NetworkPolicy\n# opens exactly the app's port.\n` +
      `apiVersion: networking.k8s.io/v1\nkind: NetworkPolicy\nmetadata:\n${meta("default-deny-ingress")}\nspec:\n` +
      `  podSelector: {}\n  policyTypes:\n    - Ingress\n`,
    "serviceaccount.yaml":
      `# The deployer identity CI's token belongs to (auth.method "token"). Bind it:\n` +
      `#   kubectl -n ${ns} create rolebinding ${APP}-deployer-edit --clusterrole=edit --serviceaccount=${ns}:${APP}-deployer\n` +
      `apiVersion: v1\nkind: ServiceAccount\nmetadata:\n${meta(`${APP}-deployer`)}\n`,
    "secret.yaml":
      `# SKELETON — values are placeholders. This file is NEVER applied by this\n# tool; create the real Secret with the printed command.\n` +
      `apiVersion: v1\nkind: Secret\nmetadata:\n${meta(`${APP}-env`)}\ntype: Opaque\nstringData:\n  EXAMPLE_KEY: REPLACE_ME\n`,
  };

  const dir = join(deployOutbox(envName), "bootstrap");
  mkdirSync(dir, { recursive: true });
  for (const [name, body] of Object.entries(skeletons)) writeFileSync(join(dir, name), body);
  write(`${Object.keys(skeletons).length} skeleton(s) staged in ${dir}/`);

  write("");
  write("Secrets are never applied, even with --commit --approve — create them in the cluster yourself:");
  write(`    kubectl -n ${ns} create secret generic ${APP}-env --from-literal=EXAMPLE_KEY=<value>`);
  write(`    oc -n ${ns} create secret generic ${APP}-env --from-literal=EXAMPLE_KEY=<value>   # OpenShift`);
  write("");
  write(`GitHub environment protection — make "approval: required" real before CD reaches ${envName}:`);
  write("    gh api /users/<login> --jq .id                                  # reviewer id");
  write(`    gh api --method PUT "/repos/<owner>/<repo>/environments/${envName}" \\`);
  write(`      --input - <<'JSON'`);
  write(`    { "reviewers": [ { "type": "User", "id": <id> } ] }`);
  write("    JSON");

  if (!commit) {
    write("");
    ok(`bootstrap: staged only — review ${dir}/, then re-run with --commit --approve to apply everything except Secrets`);
    return;
  }

  assertMayDeploy(envName, `deploy.${envName}`, {}, cfg);
  assertContextMatches(envName, cfg);
  const applied = Object.keys(skeletons).filter((f) => f !== "secret.yaml");
  write("");
  write(`apply plan for ${ns}:`);
  for (const name of applied) write(`    ${name}`);
  write("    secret.yaml SKIPPED — Secrets travel by hand, never through this tool");
  requireTool("kubectl", "nothing was applied");
  for (const name of applied) {
    if (live("kubectl", ["apply", "-f", join(dir, name)]) !== 0) fail(`kubectl apply failed on ${name}`);
  }
  ok(`bootstrap: ${applied.length} object(s) applied to ${ns}; the Secret skeleton was not`);
}

// --- deploy: replay the staged render through helm, atomically ------------------
function cmdDeploy() {
  const env = cfg.environments?.[envName] ?? {};
  const ns = env.cluster?.namespace ?? "";
  if (!commit) {
    const staged = stagedFiles(envName);
    write(`deploy ${envName} (staged preview — nothing ran):`);
    write(`    staged render: ${staged.length > 0 ? staged.join(", ") : `none — run pnpm env:remote render --env ${envName}`}`);
    write(
      `    would run: helm upgrade --install ${APP} ${CHART} -f ${valuesFile} --atomic --timeout 5m --history-max ${KEEP} -n ${ns || "<namespace>"}`,
    );
    write(`    proceed with: pnpm env:remote deploy --env ${envName} --commit --approve`);
    return;
  }
  assertMayDeploy(envName, `deploy.${envName}`, {}, cfg);
  assertContextMatches(envName, cfg);
  requireValues();
  requireTool("helm", "nothing was deployed");
  const args = ["upgrade", "--install", APP, CHART, "-f", valuesFile, "--atomic", "--timeout", "5m", "--history-max", String(KEEP), "--namespace", ns];
  if (imageOverride !== undefined) args.push("--set", `image.repository=${imageOverride}`);
  if (digest !== undefined) args.push("--set", `image.digest=${digest}`);
  if (live("helm", args) !== 0) {
    fail(`helm upgrade failed for ${envName} — --atomic has already rolled the release back`);
  }
  ok(`deploy: ${APP} rolled out to ${envName} (namespace ${ns})`);
  if (env.url) write(`Prove it: node deploy/smoke.mjs --url ${env.url}`);
}

// --- rollback: the staged artefact is the release history helm already keeps ----
function cmdRollback() {
  const env = cfg.environments?.[envName] ?? {};
  const ns = env.cluster?.namespace ?? "";
  if (!commit) {
    write(`rollback ${envName} (preview — nothing ran):`);
    write(`    would run: helm rollback ${APP}${revision !== undefined ? ` ${revision}` : ""} -n ${ns || "<namespace>"} --wait`);
    write(`    the window is the last ${KEEP} release(s) (deployment.helm.keepHistory)`);
    write(`    proceed with: pnpm env:remote rollback --env ${envName} --commit --approve`);
    return;
  }
  assertMayDeploy(envName, `deploy.${envName}`, { render: false }, cfg);
  assertContextMatches(envName, cfg);
  requireTool("helm", "nothing was rolled back");
  const args = ["rollback", APP];
  if (revision !== undefined) args.push(revision);
  args.push("-n", ns, "--wait");
  if (live("helm", args) !== 0) fail(`helm rollback failed for ${envName}`);
  ok(`rollback: ${APP} on ${envName} is back on ${revision !== undefined ? `revision ${revision}` : "the previous release"}`);
  if (env.url) write(`Prove it: node deploy/smoke.mjs --url ${env.url}`);
}

// --- status: what the cluster believes is running --------------------------------
function cmdStatus() {
  const env = assertReadOnlyAccess(envName, cfg).env;
  assertContextMatches(envName, cfg);
  requireTool("helm", "status reads the release history and needs it");
  const ns = env.cluster?.namespace ?? "";
  if (live("helm", ["status", APP, "-n", ns]) !== 0) fail(`helm status failed — is ${APP} released to ${ns} yet?`);
  live("helm", ["history", APP, "-n", ns, "--max", String(KEEP)]);
  ok(`status: ${envName} shown above (history window ${KEEP})`);
}

({
  check: cmdCheck,
  render: cmdRender,
  diff: cmdDiff,
  bootstrap: cmdBootstrap,
  deploy: cmdDeploy,
  rollback: cmdRollback,
  status: cmdStatus,
})[command]();

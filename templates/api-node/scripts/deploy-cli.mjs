import { readFileSync } from "node:fs";
import { REMOTE_ENVS, loadConfig, promotionChain } from "./config.mjs";
import { fail } from "./lib.mjs";

// @adr 200 - the CD plan is computed from the declaration, never hand-kept
// Usage: node scripts/deploy-cli.mjs plan [--github-output]
//
// The one place `.proto-forge/config.json` is translated into what the
// delivery workflows need: the image reference, the sign/scan switches, the
// per-environment facts and the effective-predecessor map the skip-tolerant
// needs chain in cd.yml rests on. Deterministic and offline — the same config
// yields the same plan on a laptop and in CI; the only environmental input is
// GITHUB_REPOSITORY, the registry default when the config names none.
//
// Output: plain JSON on stdout, or `key=value` lines (plus a one-line `plan`
// JSON) with --github-output, ready for `>> "$GITHUB_OUTPUT"`. Not a gate:
// it asserts nothing, it only derives.

const appName = () => {
  try {
    return JSON.parse(readFileSync("package.json", "utf8")).name ?? "app";
  } catch {
    return "app";
  }
};

// trivy takes the severities to FAIL on, so a threshold is "this level and up".
const SEVERITY = { critical: "CRITICAL", high: "HIGH,CRITICAL", medium: "MEDIUM,HIGH,CRITICAL" };

export function buildPlan(cfg = loadConfig()) {
  const deployment = cfg.deployment ?? {};
  const app = appName();

  // The image path: the configured registry prefix plus the app name, or the
  // GHCR path GitHub derives from the repository (lowercased — GHCR requires it).
  const configured = deployment.imageRegistry ?? "";
  const repo = process.env.GITHUB_REPOSITORY?.toLowerCase();
  const image = configured !== "" ? `${configured.replace(/\/$/, "")}/${app}` : `ghcr.io/${repo ?? "OWNER/REPO"}`;

  const chain = promotionChain(cfg);
  const environments = {};
  for (const name of REMOTE_ENVS) {
    const e = cfg.environments?.[name] ?? {};
    const enabled = e.enabled === true;
    environments[name] = {
      enabled,
      url: e.url ?? "",
      cluster: {
        type: e.cluster?.type ?? "generic",
        server: e.cluster?.server ?? "",
        namespace: e.cluster?.namespace ?? "",
      },
      approval: e.approval ?? "required",
      auth: {
        method: e.auth?.method ?? "kubeconfig",
        tokenEnv: e.auth?.tokenEnv ?? "KUBE_TOKEN",
        kubeconfigEnv: e.auth?.kubeconfigEnv ?? "KUBECONFIG",
        azureClientIdEnv: e.auth?.azureClientIdEnv ?? "AZURE_CLIENT_ID",
        azureTenantIdEnv: e.auth?.azureTenantIdEnv ?? "AZURE_TENANT_ID",
        azureSubscriptionIdEnv: e.auth?.azureSubscriptionIdEnv ?? "AZURE_SUBSCRIPTION_ID",
      },
      // The effective predecessor: the previous ENABLED environment in the
      // chain. A disabled environment sits in nobody's path — its CD job skips
      // and the chain continues, which is why this map exists at all.
      predecessor: enabled ? (chain[chain.indexOf(name) - 1] ?? "") : "",
    };
  }

  return {
    app,
    image,
    registryHost: image.split("/")[0],
    sign: deployment.sign === true,
    scan: deployment.scan?.image === true,
    severity: SEVERITY[deployment.scan?.severityThreshold] ?? SEVERITY.high,
    chartPath: deployment.helm?.chartPath ?? "deploy/chart",
    keepHistory: deployment.helm?.keepHistory ?? 5,
    chain,
    environments,
  };
}

/** Flatten to `key=value` lines for $GITHUB_OUTPUT. Values are single-line by construction. */
export function githubOutputLines(plan) {
  const lines = [
    `app=${plan.app}`,
    `image=${plan.image}`,
    `registry_host=${plan.registryHost}`,
    `sign=${plan.sign}`,
    `scan=${plan.scan}`,
    `severity=${plan.severity}`,
    `chart_path=${plan.chartPath}`,
    `keep_history=${plan.keepHistory}`,
    `chain=${plan.chain.join(" ")}`,
  ];
  for (const [name, e] of Object.entries(plan.environments)) {
    lines.push(
      `${name}_enabled=${e.enabled}`,
      `${name}_url=${e.url}`,
      `${name}_cluster_type=${e.cluster.type}`,
      `${name}_server=${e.cluster.server}`,
      `${name}_namespace=${e.cluster.namespace}`,
      `${name}_approval=${e.approval}`,
      `${name}_predecessor=${e.predecessor}`,
    );
  }
  // The whole plan as one line, for jobs that prefer fromJson() over 60 outputs.
  lines.push(`plan=${JSON.stringify(plan)}`);
  return lines;
}

const [command] = process.argv.slice(2);
if (command !== "plan") {
  fail(`usage: node scripts/deploy-cli.mjs plan [--github-output]`, [
    `got ${JSON.stringify(command ?? "")} — "plan" is the only subcommand.`,
  ]);
}

const plan = buildPlan();
if (process.argv.includes("--github-output")) {
  process.stdout.write(`${githubOutputLines(plan).join("\n")}\n`);
} else {
  process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
}

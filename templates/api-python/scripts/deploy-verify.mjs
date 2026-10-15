import { execSync, spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { parse } from "yaml";
import { note, read } from "./lib.mjs";
import { REMOTE_ENVS, gateResult, loadConfig, today } from "./config.mjs";

// @adr 201 - the deploy surface is verified offline, on every run
// Nothing here opens a socket: the native half lints the committed artefacts
// (Dockerfile pins, compose healthchecks, the values securityContext contract,
// exposure ⇔ cluster type, .trivyignore discipline), and the tool half renders
// and validates them with docker/hadolint/helm/kubeconform WHEN PRESENT — noted
// locally, mandatory in CI (the sec-scan tool-gating pattern). Vendored
// schemas in deploy/schemas keep kubeconform offline too. A deploy problem
// found by this gate costs a diff; found by the cluster it costs an outage.

const errors = [];
const cfg = loadConfig();

const has = (cmd) => {
  try {
    execSync(`command -v ${cmd}`, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
};

// Tools are gated one way everywhere: enforce when installed, one loud note
// locally when not, hard error in CI — a pipeline must never skip silently.
const missingTools = new Set();
function withTool(name) {
  if (has(name)) return true;
  missingTools.add(name);
  return false;
}

const run = (cmd, input) => {
  const r = spawnSync("sh", ["-c", cmd], { encoding: "utf8", input });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
};

const SECRET_SHAPED = /(TOKEN|SECRET|PASSWORD|PASSWD|APIKEY|API_KEY|PRIVATE)/i;
const NON_VALUE = /^(|CHANGE_ME|REPLACE_ME|\$\{[^}]+\}|"\s*"|'\s*')$/;

// --- Dockerfile: pinned, secretless, non-root --------------------------------
const DOCKERFILE = "Dockerfile";
if (!existsSync(DOCKERFILE)) {
  errors.push(`${DOCKERFILE} is missing — the image every environment runs is part of the template`);
} else {
  const body = read(DOCKERFILE);
  const lines = body.split(/\r?\n/);
  const stageNames = new Set();
  let hasUserOrNonRootNote = /^#\s*non-root base\b/m.test(body) || lines.some((l) => /^\s*USER\s+\S+/.test(l));

  for (const [i, line] of lines.entries()) {
    const at = `${DOCKERFILE}:${i + 1}`;
    const from = line.match(/^\s*FROM\s+(\S+)(?:\s+AS\s+(\S+))?/i);
    if (from !== null) {
      const [, ref, alias] = from;
      if (alias !== undefined) stageNames.add(alias.toLowerCase());
      if (!stageNames.has(ref.toLowerCase()) && !/@sha256:[0-9a-f]{64}/.test(ref)) {
        errors.push(`${at}: FROM ${ref} floats on a tag — pin it by digest (image@sha256:…); a tag is a name, a digest is the bytes`);
      }
      continue;
    }
    if (/^\s*ADD\s+/i.test(line) && /https?:\/\//i.test(line)) {
      errors.push(`${at}: ADD from a URL fetches unverified bytes at build time — vendor the file or use a pinned base instead`);
    }
    const declare = line.match(/^\s*(ENV|ARG)\s+(.+)$/i);
    if (declare !== null) {
      // Both `KEY=value` pairs and the legacy `ENV KEY value` form.
      const pairs = [...declare[2].matchAll(/([A-Za-z_][A-Za-z0-9_]*)=("[^"]*"|'[^']*'|\S*)/g)];
      const legacy = pairs.length === 0 ? declare[2].match(/^([A-Za-z_][A-Za-z0-9_]*)\s+(.+)$/) : null;
      const found = legacy !== null ? [[legacy[0], legacy[1], legacy[2]]] : pairs;
      for (const [, key, value] of found) {
        if (SECRET_SHAPED.test(key) && !NON_VALUE.test((value ?? "").replace(/^["']|["']$/g, "").trim())) {
          errors.push(`${at}: ${declare[1].toUpperCase()} ${key} carries a secret-shaped default — an image layer is forever; inject it at runtime by name`);
        }
      }
    }
  }
  if (!hasUserOrNonRootNote) {
    errors.push(`${DOCKERFILE}: no USER directive and no "# non-root base" note — state how this image avoids running as root`);
  }
}

// --- compose: parses, and every service can prove it is alive ----------------
const COMPOSE = "deploy/compose/docker-compose.yml";
let composeOk = false;
if (!existsSync(COMPOSE)) {
  errors.push(`${COMPOSE} is missing — the single-host simple mode ships with the template`);
} else {
  try {
    const compose = parse(read(COMPOSE));
    composeOk = true;
    for (const [name, svc] of Object.entries(compose?.services ?? {})) {
      if (svc?.healthcheck === undefined) {
        errors.push(`${COMPOSE}: service "${name}" has no healthcheck — "it started" is not "it works"`);
      }
    }
  } catch {
    errors.push(`${COMPOSE}: not parseable YAML`);
  }
}

// --- values: the securityContext contract, everywhere, effectively -----------
const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const deepMerge = (base, over) => {
  const out = { ...base };
  for (const [k, v] of Object.entries(over ?? {})) out[k] = isObject(v) && isObject(base?.[k]) ? deepMerge(base[k], v) : v;
  return out;
};

const CHART = "deploy/chart";
const BASE_VALUES = `${CHART}/values.yaml`;
const VALUES_DIR = `${CHART}/values`;

function loadYaml(path) {
  try {
    return parse(read(path));
  } catch {
    errors.push(`${path}: not parseable YAML`);
    return null;
  }
}

/** The fields a deployable values set must carry — checked on the EFFECTIVE
 *  values (env file merged over base), so an env file overrides without
 *  restating the contract, but can never silently drop it. */
function checkValues(label, v) {
  if (!isObject(v.resources?.limits) || Object.keys(v.resources.limits).length === 0) {
    errors.push(`${label}: no resources.limits — an unbounded pod is everyone's incident`);
  }
  for (const probe of ["readiness", "liveness"]) {
    if (v.probes?.[probe]?.path === undefined) errors.push(`${label}: no probes.${probe} — the cluster cannot tell alive from wedged`);
  }
  const sc = v.securityContext ?? {};
  if (sc.runAsNonRoot !== true) errors.push(`${label}: securityContext.runAsNonRoot must be true`);
  if (sc.allowPrivilegeEscalation !== false) errors.push(`${label}: securityContext.allowPrivilegeEscalation must be false`);
  if (!Array.isArray(sc.capabilities?.drop) || !sc.capabilities.drop.includes("ALL")) {
    errors.push(`${label}: securityContext.capabilities.drop must include ALL`);
  }
  if (sc.seccompProfile?.type !== "RuntimeDefault") errors.push(`${label}: securityContext.seccompProfile.type must be RuntimeDefault`);
  if (sc.readOnlyRootFilesystem !== true) errors.push(`${label}: securityContext.readOnlyRootFilesystem must be true`);
  if ("runAsUser" in sc) {
    errors.push(`${label}: securityContext.runAsUser is set — a hardcoded UID fights OpenShift's arbitrary-UID SCC; runAsNonRoot is the contract`);
  }
  if (!["ingress", "route", "none"].includes(v.expose?.kind)) {
    errors.push(`${label}: expose.kind must be ingress|route|none, got ${JSON.stringify(v.expose?.kind)}`);
  }
}

let baseValues = null;
if (!existsSync(BASE_VALUES)) {
  errors.push(`${BASE_VALUES} is missing — the chart's environment-independent contract lives there`);
} else {
  baseValues = loadYaml(BASE_VALUES);
  if (baseValues !== null) checkValues(BASE_VALUES, baseValues);
}

const envValues = new Map();
if (existsSync(VALUES_DIR)) {
  for (const f of readdirSync(VALUES_DIR).filter((f) => /\.ya?ml$/.test(f))) {
    const v = loadYaml(`${VALUES_DIR}/${f}`);
    if (v === null) continue;
    envValues.set(f.replace(/\.ya?ml$/, ""), v);
    if (baseValues !== null) checkValues(`${VALUES_DIR}/${f} (effective)`, deepMerge(baseValues, v));
  }
}

// Exposure ⇔ cluster type, per enabled environment: a Route object only means
// something to an OpenShift router, and an OpenShift environment terminates at
// a Route (or stays unexposed) rather than at a generic Ingress.
const enabledEnvs = REMOTE_ENVS.filter((e) => cfg.environments?.[e]?.enabled === true);
for (const env of enabledEnvs) {
  const v = envValues.get(env);
  if (v === undefined || baseValues === null) continue; // the missing-file case is env:verify's finding
  const effective = deepMerge(baseValues, v);
  const kind = effective.expose?.kind;
  const clusterType = cfg.environments[env].cluster?.type;
  if (kind === "route" && clusterType !== "openshift") {
    errors.push(`${VALUES_DIR}/${env}.yaml: expose.kind "route" but environments.${env}.cluster.type is "${clusterType}" — a Route is OpenShift-only`);
  }
  if (clusterType === "openshift" && kind === "ingress") {
    errors.push(`${VALUES_DIR}/${env}.yaml: expose.kind "ingress" on an openshift environment — use "route" (or "none"), the router is the TLS edge there`);
  }
}

// --- .trivyignore: every suppression is reasoned and expires ------------------
const TRIVYIGNORE = ".trivyignore";
if (existsSync(TRIVYIGNORE)) {
  const lines = read(TRIVYIGNORE).split(/\r?\n/);
  const now = today();
  for (const [i, line] of lines.entries()) {
    const t = line.trim();
    if (t === "" || t.startsWith("#")) continue;
    const above = (lines[i - 1] ?? "").trim();
    const m = above.match(/^#\s*reason:\s*(.+?)\s+until:\s*(\d{4}-\d{2}-\d{2})\s*$/);
    if (m === null) {
      errors.push(`${TRIVYIGNORE}:${i + 1}: "${t}" has no "# reason: … until: YYYY-MM-DD" line above it — an unreasoned suppression is a finding nobody triaged`);
    } else if (m[2] < now) {
      errors.push(`${TRIVYIGNORE}:${i + 1}: "${t}" expired on ${m[2]} — re-triage it or let the scan fail honestly`);
    }
  }
}

// --- tool-gated: render and validate with the real toolchain -----------------
if (composeOk && withTool("docker")) {
  const r = run(`docker compose -f ${COMPOSE} config -q`);
  if (r.code !== 0) errors.push(`docker compose config rejected ${COMPOSE}:\n${r.out.trim()}`);
}

if (existsSync(DOCKERFILE) && withTool("hadolint")) {
  const r = run(`hadolint ${DOCKERFILE}`);
  if (r.code !== 0) errors.push(`hadolint rejected ${DOCKERFILE}:\n${r.out.trim()}`);
}

if (existsSync(CHART) && withTool("helm")) {
  const lint = run(`helm lint ${CHART}`);
  if (lint.code !== 0) errors.push(`helm lint rejected ${CHART}:\n${lint.out.trim()}`);

  const kubeconformPresent = withTool("kubeconform");
  for (const env of enabledEnvs) {
    if (!envValues.has(env)) continue;
    const render = run(`helm template smoke ${CHART} -f ${VALUES_DIR}/${env}.yaml`);
    if (render.code !== 0) {
      errors.push(`helm template failed for ${env}:\n${render.out.trim()}`);
      continue;
    }
    // The rendered truth, not just the values: the manifests the cluster will
    // actually apply must carry the non-root contract.
    if (!/runAsNonRoot:\s*true/.test(render.out)) {
      errors.push(`rendered manifests for ${env} never state runAsNonRoot: true`);
    }
    if (cfg.environments[env].cluster?.type === "openshift" && /runAsUser/.test(render.out)) {
      errors.push(`rendered manifests for ${env} set runAsUser on an openshift environment — the SCC assigns the UID`);
    }
    if (kubeconformPresent) {
      // Vendored schemas only — kubeconform stays offline like everything else in verify.
      const kc = run(
        `kubeconform -strict -summary -schema-location 'deploy/schemas/{{ .ResourceKind }}{{ .KindSuffix }}.json'`,
        render.out,
      );
      if (kc.code !== 0) errors.push(`kubeconform rejected the rendered manifests for ${env}:\n${kc.out.trim()}`);
    }
  }
}

// NFR-30: the delivery pipeline carries the perf-smoke stage with its coarse
// ceilings stated as reviewable env values. The stage is config-gated
// (deployment.perfSmoke), so the check binds the WORKFLOW: losing the step, or
// stripping its budgets, silently removes the only pipeline stop that notices
// an image that no longer boots, errors under load, or doubled in size.
const PACKAGE_WORKFLOW = ".github/workflows/package.yml";
if (existsSync(PACKAGE_WORKFLOW)) {
  let steps = [];
  try {
    const wf = parse(read(PACKAGE_WORKFLOW));
    steps = Object.values(wf?.jobs ?? {}).flatMap((job) => job?.steps ?? []);
  } catch {
    errors.push(`${PACKAGE_WORKFLOW}: not parseable as YAML`);
  }
  const perf = steps.find((s) => s?.name === "perf smoke");
  if (perf === undefined) {
    errors.push(`${PACKAGE_WORKFLOW}: the "perf smoke" stage is missing — the pipeline lost its coarse performance and image-size stop (NFR-30)`);
  } else {
    for (const key of ["PERF_LATENCY_BUDGET_MS", "PERF_IMAGE_SIZE_BUDGET_MB"]) {
      if (perf.env?.[key] === undefined) {
        errors.push(`${PACKAGE_WORKFLOW}: the "perf smoke" stage lost its ${key} ceiling — a smoke without a budget asserts nothing (NFR-30)`);
      }
    }
  }
}

for (const tool of missingTools) {
  if (process.env.CI) {
    errors.push(`${tool} is not installed in CI — the deploy verification it performs is mandatory there`);
  } else {
    note(`${tool} not installed — skipping its checks locally (CI enforces; install to enforce here)`);
  }
}

gateResult(
  "deploy",
  `deploy:verify: Dockerfile pinned and secretless, compose healthchecked, values carry the securityContext contract` +
    `${missingTools.size > 0 ? ` (skipped locally: ${[...missingTools].join(", ")})` : ", full toolchain green"}`,
  errors,
);

import { existsSync, readdirSync, writeFileSync } from "node:fs";
import { parse } from "yaml";
import { read, walk } from "./lib.mjs";
import { ENV_ORDER, REMOTE_ENVS, gateResult, loadConfig } from "./config.mjs";

// @adr 200 - an environment exists by being declared, and nowhere else
// The config's environments{} object is the single declaration of the delivery
// chain. Everything that MENTIONS an environment is derived from it, and this
// gate fails the moment any copy drifts:
//   1. .env.example documents exactly the four keys Settings binds
//   2. no committed delivery file carries a secret-shaped VALUE — a secret's
//      NAME may appear anywhere, its value only in the cluster or the vault
//   3. an enabled environment has its deploy/chart/values/<env>.yaml, and a
//      values file without its enabled environment is an orphan — both ways
//   4. the DEPLOYMENT.md environment table equals the derived one
//      (`--write` regenerates it between the markers)

const errors = [];
const cfg = loadConfig();

// --- 1. .env.example ≡ the Settings surface -----------------------------------
// A key may be documented active (`KEY=`) or deliberately commented out
// (`# KEY=…` for optionals) — both count as documented. Kotlin's env surface is
// not machine-parseable the way a zod/pydantic schema is, so the source here is
// the FIXED list below, documented from src/main/kotlin/app/config/Settings.kt
// (Settings.fromEnvironment reads exactly these four variables, and logback.xml
// reads LOG_LEVEL again because a logging backend is configured before any of our
// Kotlin runs). Changing the surface = changing Settings, its logback.xml mapping
// AND this list — one reviewed diff.
const ENV_FILE = ".env.example";
const SCHEMA_KEYS = ["PORT", "LOG_LEVEL", "DATABASE_URL", "GIT_SHA"];

const exampleKeys = new Set();
if (!existsSync(ENV_FILE)) {
  errors.push(`${ENV_FILE} is missing — the documented environment surface is part of the template`);
} else {
  for (const line of read(ENV_FILE).split(/\r?\n/)) {
    const m = line.match(/^#?\s*([A-Z][A-Z0-9_]*)=/);
    if (m !== null) exampleKeys.add(m[1]);
  }
}

const schemaKeys = new Set(SCHEMA_KEYS);

for (const key of schemaKeys) {
  if (!exampleKeys.has(key)) {
    errors.push(`${ENV_FILE}: missing ${key} — Settings binds it, so the example must document it`);
  }
}
for (const key of exampleKeys) {
  if (!schemaKeys.has(key)) {
    errors.push(`${ENV_FILE}: documents ${key}, which Settings never binds — dead documentation misleads`);
  }
}

// --- 2. no secret-shaped values in committed delivery files -------------------
// The check is mechanical on purpose: a key that LOOKS like a credential must
// carry no value in anything committed. "" and CHANGE_ME/REPLACE_ME are the
// allowed non-values; a ${VAR} reference names an env var rather than holding
// a secret, which is exactly the doctrine.
const SECRET_SHAPED = /(TOKEN|SECRET|PASSWORD|PASSWD|APIKEY|API_KEY|PRIVATE)/i;
const NON_VALUE = /^(|CHANGE_ME|REPLACE_ME|\$\{[^}]+\})$/;

if (existsSync(ENV_FILE)) {
  for (const line of read(ENV_FILE).split(/\r?\n/)) {
    const m = line.match(/^#?\s*([A-Z][A-Z0-9_]*)=(.*)$/);
    if (m === null || !SECRET_SHAPED.test(m[1])) continue;
    if (!NON_VALUE.test(m[2].trim())) {
      errors.push(`${ENV_FILE}: ${m[1]} carries a secret-shaped value — commit the NAME, keep the value out of git`);
    }
  }
}

function scanForSecrets(node, file, path) {
  if (node === null || typeof node !== "object") return;
  for (const [k, v] of Object.entries(node)) {
    const at = path === "" ? k : `${path}.${k}`;
    if (SECRET_SHAPED.test(k) && typeof v === "string" && !NON_VALUE.test(v.trim())) {
      errors.push(`${file}: ${at} carries a secret-shaped value — secrets travel by name, never by value`);
    }
    if (typeof v === "object") scanForSecrets(v, file, at);
  }
}

const yamlFiles = [
  ...walk("deploy/compose", (p) => /\.ya?ml$/.test(p)),
  ...walk("deploy/chart", (p) => /\.ya?ml$/.test(p) && /(^|\/)values/.test(p)),
];
for (const file of yamlFiles) {
  try {
    scanForSecrets(parse(read(file)), file, "");
  } catch {
    errors.push(`${file}: not parseable YAML — a delivery file nobody can parse deploys nothing`);
  }
}

// --- 3. enabled environment ⇔ values file ------------------------------------
const VALUES_DIR = "deploy/chart/values";
const valuesFiles = existsSync(VALUES_DIR)
  ? readdirSync(VALUES_DIR).filter((f) => /\.ya?ml$/.test(f)).map((f) => f.replace(/\.ya?ml$/, ""))
  : [];

for (const env of REMOTE_ENVS) {
  const enabled = cfg.environments?.[env]?.enabled === true;
  const hasFile = valuesFiles.includes(env);
  if (enabled && !hasFile) {
    errors.push(`environments.${env} is enabled but ${VALUES_DIR}/${env}.yaml does not exist — an environment without values cannot deploy`);
  }
  if (!enabled && hasFile) {
    errors.push(`${VALUES_DIR}/${env}.yaml exists but environments.${env} is not enabled — an orphan values file describes an environment that does not exist`);
  }
}
for (const name of valuesFiles) {
  if (!REMOTE_ENVS.includes(name)) {
    errors.push(`${VALUES_DIR}/${name}.yaml names no environment in the chain (${REMOTE_ENVS.join(", ")})`);
  }
}

// --- 4. the DEPLOYMENT.md table is derived, never hand-maintained -------------
const DOC = "docs/DEPLOYMENT.md";
const BEGIN = "<!-- env-table:begin -->";
const END = "<!-- env-table:end -->";

function derivedTable() {
  const dash = (v) => (v === undefined || v === "" ? "—" : v);
  const rows = ENV_ORDER.map((env) => {
    const e = cfg.environments?.[env] ?? {};
    const isLocal = env === "local";
    return `| ${env} | ${e.enabled === true ? "yes" : "no"} | ${isLocal ? "—" : dash(e.cluster?.type)} | ${
      isLocal ? "—" : dash(e.approval)
    } | ${dash(e.url)} |`;
  });
  return ["| env | enabled | cluster.type | approval | url |", "| --- | --- | --- | --- | --- |", ...rows].join("\n");
}

if (!existsSync(DOC)) {
  errors.push(`${DOC} is missing — the delivery chain must be documented where operators look`);
} else {
  const body = read(DOC);
  const begin = body.indexOf(BEGIN);
  const end = body.indexOf(END);
  if (begin === -1 || end === -1 || end < begin) {
    errors.push(`${DOC}: the ${BEGIN} … ${END} markers are missing — the table between them is generated, run with --write`);
  } else if (process.argv.includes("--write")) {
    const next = `${body.slice(0, begin + BEGIN.length)}\n${derivedTable()}\n${body.slice(end)}`;
    if (next !== body) writeFileSync(DOC, next);
    process.stdout.write(`✓ env:verify --write: ${DOC} table regenerated from the config\n`);
  } else {
    const current = body.slice(begin + BEGIN.length, end).trim();
    if (current !== derivedTable()) {
      errors.push(`${DOC}: the environment table drifted from the config — run \`node scripts/env-verify.mjs --write\``);
    }
  }
}

gateResult(
  "env",
  `env:verify: ${schemaKeys.size} env keys documented, secrets travel by name, ` +
    `${REMOTE_ENVS.filter((e) => cfg.environments?.[e]?.enabled === true).length} enabled environment(s) ⇔ values files, docs table current`,
  errors,
);

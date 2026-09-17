import { existsSync, readFileSync, readdirSync } from "node:fs";
import { fail, ok, read, readJson, withoutFences } from "./lib.mjs";

// The model registry is a single source (NFR-31): one file names every model the
// pipeline may run on, its tier, its price and the identity its Co-Authored-By
// trailer carries, plus the routing table (BR-50) that says which tier does
// which delegated activity. Two things go wrong with a registry nobody checks:
//   1. its shape rots — a model on no tier, an alias two models claim, a routed
//      activity nobody documented — and the gates that read it (prompt:lint,
//      commit-lint, commit-coauthor, inside every generated repository) start
//      disagreeing about what "registered" means;
//   2. the template copies drift from the master, so a prototype generated
//      from one template prices a model differently than one from another.
// This gate closes both: shape, then byte-identity of every copy the registry
// in references/templates.json says must exist.

const MASTER = "references/models.json";
const ROUTING_DOC = "references/model-routing.md";
const REGISTRY = "references/templates.json";
const COPY = ".proto-forge/models.json";

const errors = [];
for (const required of [MASTER, ROUTING_DOC, REGISTRY]) {
  if (!existsSync(required)) fail("models-lint FAILED", [`${required} is missing`]);
}

let master;
try {
  master = readJson(MASTER);
} catch (error) {
  fail("models-lint FAILED", [`${MASTER} is not JSON: ${error.message}`]);
}

// --- shape ---------------------------------------------------------------------
const tiers = master.tiers ?? {};
const tierNames = Object.keys(tiers);
if (tierNames.length < 2) errors.push(`${MASTER}: fewer than two tiers — routing needs a "cheaper" to point at`);
const ranks = new Set();
for (const [name, tier] of Object.entries(tiers)) {
  if (!Number.isInteger(tier?.rank) || tier.rank < 1) errors.push(`${MASTER}: tier "${name}" has no positive integer rank`);
  else if (ranks.has(tier.rank)) errors.push(`${MASTER}: two tiers share rank ${tier.rank}`);
  else ranks.add(tier.rank);
}

const models = Array.isArray(master.models) ? master.models : [];
if (models.length === 0) errors.push(`${MASTER}: no models listed`);
const ID = /^[a-z0-9][a-z0-9.-]*$/;
const EMAIL = /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/;
const claimed = new Map(); // id or alias (lowercase) -> the model that claimed it
const perTier = new Map(tierNames.map((t) => [t, 0]));
for (const m of models) {
  const where = `${MASTER}: model "${m?.id ?? "?"}"`;
  if (typeof m?.id !== "string" || !ID.test(m.id)) errors.push(`${where}: id must match ${ID}`);
  if (typeof m?.provider !== "string" || m.provider === "") errors.push(`${where}: no provider`);
  if (typeof m?.displayName !== "string" || m.displayName === "") errors.push(`${where}: no displayName`);
  if (!tierNames.includes(m?.tier)) errors.push(`${where}: tier "${m?.tier}" is not one of ${tierNames.join(", ")}`);
  else perTier.set(m.tier, perTier.get(m.tier) + 1);
  const p = m?.pricing;
  if (typeof p?.input !== "number" || typeof p?.output !== "number" || p.input < 0 || p.output < 0) {
    errors.push(`${where}: pricing needs numeric input and output (USD per million tokens)`);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(p?.asOf ?? "")) errors.push(`${where}: pricing.asOf must be a YYYY-MM-DD date — a price without a read date cannot go stale honestly`);
  if (typeof m?.coAuthor?.name !== "string" || m.coAuthor.name === "") errors.push(`${where}: coAuthor.name is missing`);
  if (!EMAIL.test(m?.coAuthor?.email ?? "")) errors.push(`${where}: coAuthor.email "${m?.coAuthor?.email}" is not an address`);
  if (!Array.isArray(m?.aliases)) errors.push(`${where}: aliases must be a list (empty is fine)`);
  for (const key of [m?.id, ...(Array.isArray(m?.aliases) ? m.aliases : [])]) {
    if (typeof key !== "string") continue;
    const k = key.toLowerCase();
    if (claimed.has(k) && claimed.get(k) !== m.id) errors.push(`${MASTER}: "${key}" is claimed by both ${claimed.get(k)} and ${m.id}`);
    claimed.set(k, m.id);
  }
}
for (const [tier, n] of perTier) {
  if (n === 0) errors.push(`${MASTER}: tier "${tier}" has no model — a routed activity could point at nothing`);
}

// --- routing --------------------------------------------------------------------
const routing = master.routing ?? {};
const activities = Object.keys(routing);
if (activities.length === 0) errors.push(`${MASTER}: the routing table is empty`);
const ACTIVITY = /^[a-z][a-z0-9-]*$/;
for (const [activity, tier] of Object.entries(routing)) {
  if (!ACTIVITY.test(activity)) errors.push(`${MASTER}: activity "${activity}" must be kebab-case`);
  if (!tierNames.includes(tier)) errors.push(`${MASTER}: activity "${activity}" routes to "${tier}", which is not a tier`);
}

// The prose table and the JSON table name the same activities — a row explained
// nowhere is a row nobody can argue with, and a documented row the JSON dropped
// is a promise the gate no longer keeps.
const doc = withoutFences(read(ROUTING_DOC));
const documented = new Set([...doc.matchAll(/^\|\s*`([a-z][a-z0-9-]*)`\s*\|\s*`?([a-z]+)`?\s*\|/gm)].map((m) => [m[1], m[2]]).map(([a]) => a));
const documentedTier = new Map([...doc.matchAll(/^\|\s*`([a-z][a-z0-9-]*)`\s*\|\s*`?([a-z]+)`?\s*\|/gm)].map((m) => [m[1], m[2]]));
for (const activity of activities) {
  if (!documented.has(activity)) errors.push(`${ROUTING_DOC}: activity "${activity}" is routed in ${MASTER} but has no row here`);
  else if (documentedTier.get(activity) !== routing[activity]) {
    errors.push(`${ROUTING_DOC}: "${activity}" is documented as ${documentedTier.get(activity)} but ${MASTER} routes it to ${routing[activity]}`);
  }
}
for (const activity of documented) {
  if (!(activity in routing)) errors.push(`${ROUTING_DOC}: activity "${activity}" has a row here but ${MASTER} does not route it`);
}

// --- copies ---------------------------------------------------------------------
const masterBytes = readFileSync(MASTER);
const templates = readJson(REGISTRY).templates ?? [];
if (templates.length === 0) errors.push(`${REGISTRY} lists no templates`);
for (const t of templates) {
  const copy = `${t.dir}/${COPY}`;
  if (!existsSync(copy)) {
    errors.push(`${t.id}: ${copy} is missing — every template ships the registry (NFR-31); cp ${MASTER} ${copy}`);
  } else if (!readFileSync(copy).equals(masterBytes)) {
    errors.push(`${t.id}: ${copy} differs from ${MASTER} — the master is the only place to edit; cp ${MASTER} ${copy}`);
  }
}

// --- delegation runs through pinned subagents (BR-51) ----------------------------
// Every delegable activity — one the routing table sends below the frontier tier —
// has a subagent definition whose `model` is pinned to exactly that tier, so the
// harness, not the orchestrator's memory, decides which model a dispatch runs on.
// A frontier-routed activity has NO definition: the orchestrator does it itself.
// The master lives here; every template carries a byte-identical copy under
// .claude/agents/, which is where Claude Code reads it.
const AGENTS = "references/agents";
const topRank = Math.max(...Object.values(tiers).map((t) => t?.rank ?? 0));
const delegable = activities.filter((a) => (tiers[routing[a]]?.rank ?? topRank) < topRank);
const frontmatterOf = (markdown) => {
  const m = /^---\n([\s\S]*?)\n---/.exec(markdown);
  if (m === null) return null;
  const out = {};
  for (const line of m[1].split("\n")) {
    const kv = /^([a-zA-Z][a-zA-Z0-9-]*):\s*(.*)$/.exec(line);
    if (kv !== null) out[kv[1]] = kv[2].trim();
  }
  return out;
};
const agentFiles = existsSync(AGENTS) ? readdirSync(AGENTS).filter((f) => f.endsWith(".md")).sort() : [];
if (agentFiles.length === 0) errors.push(`${AGENTS}/ has no subagent definitions — every delegable activity needs one (BR-51)`);
for (const activity of delegable) {
  const file = `${AGENTS}/${activity}.md`;
  if (!existsSync(file)) {
    errors.push(`${file} is missing — "${activity}" is routed to ${routing[activity]} and needs a subagent pinned to it (BR-51)`);
    continue;
  }
  const fm = frontmatterOf(readFileSync(file, "utf8"));
  if (fm === null) {
    errors.push(`${file}: no frontmatter`);
    continue;
  }
  if (fm.name !== activity) errors.push(`${file}: name "${fm.name ?? ""}" must be the activity "${activity}" — the Agent tool selects by name`);
  if (typeof fm.description !== "string" || fm.description === "") errors.push(`${file}: no description`);
  const pinned = typeof fm.model === "string" ? claimed.get(fm.model.toLowerCase()) : undefined;
  const model = models.find((m) => m.id === pinned);
  if (model === undefined) {
    errors.push(`${file}: model "${fm.model ?? ""}" is not a registered id or alias — the pin must resolve in this registry`);
  } else if (model.tier !== routing[activity]) {
    errors.push(`${file}: model ${model.id} is ${model.tier}, but "${activity}" is routed to ${routing[activity]} (BR-51)`);
  }
}
for (const f of agentFiles) {
  const stem = f.slice(0, -3);
  if (!(stem in routing)) errors.push(`${AGENTS}/${f}: "${stem}" is not a routed activity — every definition is one row of the routing table`);
  else if (!delegable.includes(stem)) {
    errors.push(`${AGENTS}/${f}: "${stem}" is routed to the top tier — a frontier orchestrator performs it itself, and a lower one would pin it below its route; no definition (BR-51)`);
  }
}
for (const t of templates) {
  const dir = `${t.dir}/.claude/agents`;
  for (const f of agentFiles) {
    const copy = `${dir}/${f}`;
    if (!existsSync(copy)) errors.push(`${t.id}: ${copy} is missing — every template ships the pinned subagents; cp ${AGENTS}/${f} ${copy}`);
    else if (!readFileSync(copy).equals(readFileSync(`${AGENTS}/${f}`))) errors.push(`${t.id}: ${copy} differs from ${AGENTS}/${f} — the master is the only place to edit`);
  }
  const extras = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".md") && !agentFiles.includes(f)) : [];
  for (const f of extras) errors.push(`${t.id}: ${dir}/${f} has no master under ${AGENTS}/ — a template ships only the routed set`);
}

if (errors.length > 0) fail("models-lint FAILED", errors);
ok(
  `models-lint: ${models.length} models on ${tierNames.length} tiers, ${activities.length} routed activities, ` +
    `${templates.length} byte-identical template copies, ${agentFiles.length} subagents pinned to their routed tier`,
);

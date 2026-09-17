import { existsSync, readFileSync } from "node:fs";

// The model registry, read the same way by every gate that needs a model's
// identity: prompt-log-lint (BR-50 — is the model registered, which tier is it
// on), commit-lint and commit-coauthor (BR-46 — which Co-Authored-By identity
// does this model sign with). One reader, so the three cannot disagree about
// what "registered" means. The file is a byte-identical copy of the plugin's
// references/models.json (NFR-31) — an edit belongs there, never here.
//
// Deliberately dependency-free and lib-free: it runs inside a git hook, before
// anything else has loaded, in every stack's template.

export const REGISTRY = ".proto-forge/models.json";

/** Loads the registry, or returns a list of reasons it cannot be used. */
export function loadModels(path = REGISTRY) {
  if (!existsSync(path)) {
    return { registry: null, errors: [`${path} is missing — the seed ships the model registry (NFR-31)`] };
  }
  let registry;
  try {
    registry = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    return { registry: null, errors: [`${path} is not JSON: ${error.message}`] };
  }
  const errors = [];
  if (typeof registry?.tiers !== "object" || registry.tiers === null) errors.push(`${path}: no "tiers" object`);
  if (!Array.isArray(registry?.models) || registry.models.length === 0) errors.push(`${path}: no "models" list`);
  if (typeof registry?.routing !== "object" || registry.routing === null) errors.push(`${path}: no "routing" table`);
  return { registry: errors.length > 0 ? null : registry, errors };
}

/** A model by id or alias, case-insensitive; undefined when the registry has none. */
export function resolveModel(registry, nameOrId) {
  if (typeof nameOrId !== "string") return undefined;
  const key = nameOrId.trim().toLowerCase();
  if (key === "") return undefined;
  return registry.models.find(
    (m) => m.id.toLowerCase() === key || (m.aliases ?? []).some((a) => a.toLowerCase() === key),
  );
}

/** The rank of a tier, or undefined for a tier the registry does not define. */
export const tierRank = (registry, tier) => registry.tiers?.[tier]?.rank;

/** The trailer a model signs with: `Co-Authored-By: Name <email>`. */
export const coAuthorTrailer = (model) => `Co-Authored-By: ${model.coAuthor.name} <${model.coAuthor.email}>`;

/** The frontmatter of a prompt-log entry as key -> value (string), or null without one. */
export function frontmatter(markdown) {
  const m = /^---\n([\s\S]*?)\n---/.exec(markdown);
  if (m === null) return null;
  const out = {};
  for (const line of m[1].split("\n")) {
    const kv = /^([a-z][a-z0-9-]*):\s*(.*)$/i.exec(line);
    if (kv !== null) out[kv[1].toLowerCase()] = kv[2].trim();
  }
  return out;
}

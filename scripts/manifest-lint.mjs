import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { readJson, fail, ok } from "./lib.mjs";

// The plugin is installable from this repository alone, which means its identity
// lives here and in one shape. Four files state it, and a release bumps all four:
//
//   package.json                        the plugin-level gates
//   skill.json                          the engine
//   plugin/.claude-plugin/plugin.json   the installable
//   .claude-plugin/marketplace.json     the listing
//
// Drift between them is silent and only surfaces at install time, on someone
// else's machine, which is the worst place to find it.

const MANIFESTS = {
  pkg: "package.json",
  skill: "skill.json",
  plugin: "plugin/.claude-plugin/plugin.json",
  marketplace: ".claude-plugin/marketplace.json",
};

const errors = [];
const missing = Object.values(MANIFESTS).filter((p) => !existsSync(p));
if (missing.length > 0) fail("manifest-lint FAILED", missing.map((p) => `${p} is missing`));

const read = {};
for (const [key, path] of Object.entries(MANIFESTS)) {
  try {
    read[key] = readJson(path);
  } catch (e) {
    errors.push(`${path} does not parse: ${e.message}`);
  }
}
if (errors.length > 0) fail("manifest-lint FAILED", errors);

const entries = read.marketplace.plugins;
if (!Array.isArray(entries) || entries.length !== 1) {
  errors.push(
    `${MANIFESTS.marketplace}: plugins[] must hold exactly one entry (this repository is one plugin), got ` +
      `${Array.isArray(entries) ? entries.length : typeof entries}`,
  );
}
const entry = Array.isArray(entries) && entries.length === 1 ? entries[0] : null;

// Name: one string across every manifest, including the marketplace's own name.
const names = {
  [MANIFESTS.pkg]: read.pkg.name,
  [MANIFESTS.skill]: read.skill.name,
  [MANIFESTS.plugin]: read.plugin.name,
  [`${MANIFESTS.marketplace} (marketplace)`]: read.marketplace.name,
  ...(entry === null ? {} : { [`${MANIFESTS.marketplace} (entry)`]: entry.name }),
};
const distinctNames = [...new Set(Object.values(names))];
if (distinctNames.length > 1) {
  errors.push(
    `name disagreement: ${Object.entries(names)
      .map(([where, v]) => `${where}="${v}"`)
      .join(", ")}`,
  );
}

const versions = {
  [MANIFESTS.pkg]: read.pkg.version,
  [MANIFESTS.skill]: read.skill.version,
  [MANIFESTS.plugin]: read.plugin.version,
  ...(entry === null ? {} : { [`${MANIFESTS.marketplace} (entry)`]: entry.version }),
};
const distinctVersions = [...new Set(Object.values(versions))];
if (distinctVersions.length > 1) {
  errors.push(
    `version disagreement: ${Object.entries(versions)
      .map(([where, v]) => `${where}="${v}"`)
      .join(", ")} — a release bumps all of them together`,
  );
}
for (const [where, v] of Object.entries(versions)) {
  if (typeof v !== "string" || !/^\d+\.\d+\.\d+$/.test(v)) errors.push(`${where}: version "${v}" is not SemVer`);
}

// The listing has to point at something that exists, or the install fails for
// everyone except the author.
if (entry !== null) {
  const source = typeof entry.source === "string" ? entry.source : "";
  if (source === "") {
    errors.push(`${MANIFESTS.marketplace}: entry has no source`);
  } else if (!existsSync(source) || !statSync(source).isDirectory()) {
    errors.push(`${MANIFESTS.marketplace}: source "${source}" is not a directory in this repository`);
  }
}

// The installable must point back at the skill it installs.
const skills = read.plugin.skills;
if (!Array.isArray(skills) || skills.length === 0) {
  errors.push(`${MANIFESTS.plugin}: skills[] must name the skill directory this plugin installs`);
} else {
  for (const rel of skills) {
    const resolved = join("plugin", ".claude-plugin", rel);
    if (!existsSync(join(resolved, "SKILL.md"))) {
      errors.push(`${MANIFESTS.plugin}: skills entry "${rel}" resolves to no SKILL.md`);
    }
  }
}

if (errors.length > 0) fail("manifest-lint FAILED", errors);
ok(`manifest-lint: 4 manifests agree on "${distinctNames[0]}" v${distinctVersions[0]}`);

import { existsSync } from "node:fs";
import { basename, join } from "node:path";
import { walk, read, readJson, isMarkdown, fail, ok } from "./lib.mjs";

// The plugin has to be installable and readable on its own. Three failure modes,
// two of which the repository actually had:
//   1. a skill's frontmatter drifting from its skill.json, so a loader and a
//      release script disagree about what the thing is called
//   2. prose pointing at a file that lives on the author's machine — a reader
//      following the pointer finds nothing, and the norm it cites is unavailable
//   3. (since the second skill) a skills[] entry whose manifests disagree with the
//      register, or two skills fighting over one name
//
// (2) is narrower than "no home paths". Telling a reader to run
// `cp -R proto-forge ~/.claude/skills/proto-forge` is an instruction about THEIR
// machine and is correct. What is banned is a pointer to a file this repository
// is expected to contain and does not.
//
// plugin/.claude-plugin/plugin.json `skills[]` is the single register (ADR 008):
// every entry must resolve to a complete skill, and there is no silent
// root-skill-only mode — a repo without the register fails here, loudly.

// Paths that are instructions to the reader, not references to our own files.
const READER_PATHS = new Set(["~/.claude/skills/proto-forge", "~/.config/proto-forge/config.json"]);
const HOME_POINTER = /(?:~|\/Users)\/[^\s`'")\],;]*/g;
const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/;

// A decision record that removes a pointer has to quote the pointer it removed,
// or it cannot state what it decided. Such a record declares it once, at the top,
// with a reason. Honoured ONLY under docs/adr/ — the skills, the READMEs and the
// reference files have no way to opt out, which is where it matters.
const HISTORICAL = /<!--\s*historical-pointers:\s*(.{15,}?)\s*-->/;
const mayQuoteHistory = (file, body) => file.startsWith("docs/adr/") && HISTORICAL.test(body);

const PLUGIN = "plugin/.claude-plugin/plugin.json";

const errors = [];

if (!existsSync(PLUGIN)) fail("skill-lint FAILED", [`${PLUGIN} is missing — the skills register is the plugin`]);
const plugin = readJson(PLUGIN);
const register = plugin.skills;
if (!Array.isArray(register) || register.length === 0) {
  fail("skill-lint FAILED", [`${PLUGIN}: skills[] is empty — a plugin with no skill installs nothing`]);
}

// The version every skill must agree with. Guarded: the fixture repos the
// selftest builds may omit package.json, and manifest-lint owns its presence.
const rootVersion = existsSync("package.json") ? readJson("package.json").version : undefined;

const claimedNames = new Map(); // name -> the entry that claimed it

for (const entry of register) {
  // Entries are relative to the plugin manifest's directory; "../.." is the root skill.
  const dir = join("plugin", ".claude-plugin", entry);
  const isRoot = dir === ".";
  const skillMd = join(dir, "SKILL.md");
  const manifestPath = join(dir, "skill.json");

  if (!existsSync(skillMd)) {
    errors.push(`${PLUGIN}: skills entry "${entry}" has no ${skillMd} — the skill is the product`);
    continue;
  }
  if (!existsSync(manifestPath)) {
    errors.push(`${PLUGIN}: skills entry "${entry}" has no ${manifestPath}`);
    continue;
  }
  const manifest = readJson(manifestPath);

  const front = /^---\n([\s\S]*?)\n---/.exec(read(skillMd));
  if (front === null) {
    errors.push(`${skillMd} has no --- frontmatter block; the loader needs name and description`);
    continue;
  }
  const body = front[1];
  const name = /^name:\s*(.+)$/m.exec(body)?.[1]?.trim();
  const description = /^description:\s*(.+)$/m.exec(body)?.[1]?.trim().replace(/^"|"$/g, "");

  if (name === undefined) {
    errors.push(`${skillMd} frontmatter has no name:`);
  } else {
    if (name !== manifest.name) {
      errors.push(`${skillMd} name "${name}" disagrees with ${manifestPath} name "${manifest.name}"`);
    }
    if (!KEBAB.test(name)) {
      errors.push(`${skillMd} name "${name}" is not lowercase kebab-case — the loader's grammar`);
    }
    if (isRoot && plugin.name !== undefined && name !== plugin.name) {
      errors.push(`${skillMd} (the root skill) is named "${name}", but the plugin is "${plugin.name}" — they resolve as one`);
    }
    if (!isRoot && basename(dir) !== name) {
      errors.push(`${skillMd}: directory basename "${basename(dir)}" disagrees with the skill name "${name}" — the path is the address`);
    }
    const prior = claimedNames.get(name);
    if (prior !== undefined) {
      errors.push(`skill name "${name}" is claimed by both "${prior}" and "${entry}" — names must be unique in the register`);
    }
    claimedNames.set(name, entry);
  }

  if (rootVersion !== undefined && manifest.version !== rootVersion) {
    errors.push(
      `${manifestPath} version "${manifest.version}" disagrees with package.json version "${rootVersion}" — ` +
        "a release bumps every skill together",
    );
  }

  if (description === undefined) errors.push(`${skillMd} frontmatter has no description:`);
  else if (description.length < 60) {
    errors.push(
      `${skillMd} description is ${description.length} chars — too thin to trigger reliably; ` +
        "state when to use the skill and what it produces (>=60)",
    );
  } else if (description.length > 1500) {
    errors.push(`${skillMd} description is ${description.length} chars — over the 1500 the loader accepts`);
  }
}

// Scope: prose a reader is meant to FOLLOW — every skill, both READMEs, the
// reference files and the ADRs, which are normative. Deliberately excluded are
// docs/specs/** and docs/plans/**: those are engineering records, and they quote
// the bad paths as the evidence of the defect being fixed. A gate that fails on
// the document describing the defect teaches people to delete the description.
const prose = [
  "SKILL.md",
  "README.md",
  "plugin/README.md",
  ...walk("references", isMarkdown),
  ...walk("skills", isMarkdown),
  ...walk("docs/adr", isMarkdown),
].filter((p) => existsSync(p));

let exempted = 0;
for (const file of prose) {
  const body = read(file);
  if (mayQuoteHistory(file, body)) {
    exempted += 1;
    continue;
  }
  const lines = body.split("\n");
  for (const [i, line] of lines.entries()) {
    for (const m of line.matchAll(HOME_POINTER)) {
      const pointer = m[0].replace(/[.`)]+$/, "");
      if (READER_PATHS.has(pointer)) continue;
      errors.push(
        `${file}:${i + 1}: "${pointer}" points outside this repository — ` +
          "move what it references in-repo, or drop the pointer",
      );
    }
  }
}

if (errors.length > 0) fail("skill-lint FAILED", errors);
ok(
  `skill-lint: ${register.length} skill(s) agree with their manifests and the register, ` +
    `${prose.length - exempted} prose files reference nothing outside the repo` +
    `${exempted > 0 ? ` (${exempted} decision record(s) quoting removed pointers)` : ""}`,
);

import { existsSync } from "node:fs";
import { walk, read, readJson, isMarkdown, fail, ok } from "./lib.mjs";

// The plugin has to be installable and readable on its own. Two failure modes,
// both of which the repository actually had:
//   1. the skill's frontmatter drifting from skill.json, so a loader and a
//      release script disagree about what this thing is called
//   2. prose pointing at a file that lives on the author's machine — a reader
//      following the pointer finds nothing, and the norm it cites is unavailable
//
// (2) is narrower than "no home paths". Telling a reader to run
// `cp -R proto-forge ~/.claude/skills/proto-forge` is an instruction about THEIR
// machine and is correct. What is banned is a pointer to a file this repository
// is expected to contain and does not.

// Paths that are instructions to the reader, not references to our own files.
const READER_PATHS = new Set(["~/.claude/skills/proto-forge", "~/.config/proto-forge/config.json"]);
const HOME_POINTER = /(?:~|\/Users)\/[^\s`'")\],;]*/g;

const errors = [];

if (!existsSync("SKILL.md")) fail("skill-lint FAILED", ["SKILL.md is missing — the skill is the product"]);
if (!existsSync("skill.json")) fail("skill-lint FAILED", ["skill.json is missing"]);

const skill = read("SKILL.md");
const manifest = readJson("skill.json");

const front = /^---\n([\s\S]*?)\n---/.exec(skill);
if (front === null) {
  errors.push("SKILL.md has no --- frontmatter block; the loader needs name and description");
} else {
  const body = front[1];
  const name = /^name:\s*(.+)$/m.exec(body)?.[1]?.trim();
  const description = /^description:\s*(.+)$/m.exec(body)?.[1]?.trim().replace(/^"|"$/g, "");

  if (name === undefined) errors.push("SKILL.md frontmatter has no name:");
  else if (name !== manifest.name) {
    errors.push(`SKILL.md name "${name}" disagrees with skill.json name "${manifest.name}"`);
  }

  if (description === undefined) errors.push("SKILL.md frontmatter has no description:");
  else if (description.length < 60) {
    errors.push(
      `SKILL.md description is ${description.length} chars — too thin to trigger reliably; ` +
        "state when to use the skill and what it produces (>=60)",
    );
  } else if (description.length > 1500) {
    errors.push(`SKILL.md description is ${description.length} chars — over the 1500 the loader accepts`);
  }
}

// Scope: prose a reader is meant to FOLLOW — the skill, both READMEs, the
// reference files and the ADRs, which are normative. Deliberately excluded are
// docs/specs/** and docs/plans/**: those are engineering records, and they quote
// the bad paths as the evidence of the defect being fixed. A gate that fails on
// the document describing the defect teaches people to delete the description.
const prose = [
  "SKILL.md",
  "README.md",
  "plugin/README.md",
  ...walk("references", isMarkdown),
  ...walk("docs/adr", isMarkdown),
].filter((p) => existsSync(p));

for (const file of prose) {
  const lines = read(file).split("\n");
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
ok(`skill-lint: frontmatter agrees with skill.json, ${prose.length} prose files reference nothing outside the repo`);

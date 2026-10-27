import { expect, report } from "./selftest.mjs";

// Proves skill-lint rejects what it claims to: a name that disagrees with
// skill.json, missing frontmatter, a pointer to a file outside the repo — the
// defect that made the shipped skill non-standalone — and, since the register
// generalization (ADR 008), a skills[] entry whose manifests disagree with the
// register: no skill.json, a basename that is not the name, a duplicated name,
// a version that drifted from the root.

const goodSkill = `---
name: proto-forge
description: "Use when the user wants to scaffold or build a new web-app prototype, MVP, or first shippable product slice from a short brief."
---

# proto-forge
`;
const skillJson = { name: "proto-forge", version: "0.4.0", dependencies: {}, adr: [] };

// Every fixture carries the register explicitly — there is no silent
// root-skill-only mode, and these fixtures document that.
const pluginJson = (skills = ["./"]) => ({ name: "proto-forge", version: "0.4.0", skills });

const rootOnly = (over = {}) => ({
  "SKILL.md": goodSkill,
  "skill.json": skillJson,
  ".claude-plugin/plugin.json": pluginJson(),
  ...over,
});

expect("skill-lint: a well-formed skill passes", "skill-lint.mjs", rootOnly(), { pass: true });

expect(
  "skill-lint: a name mismatch fails",
  "skill-lint.mjs",
  rootOnly({ "skill.json": { ...skillJson, name: "other" } }),
  { pass: false, matching: /name/ },
);

expect(
  "skill-lint: missing frontmatter fails",
  "skill-lint.mjs",
  rootOnly({ "SKILL.md": "# proto-forge\n" }),
  { pass: false, matching: /frontmatter/ },
);

expect(
  "skill-lint: a description too short to trigger reliably fails",
  "skill-lint.mjs",
  rootOnly({ "SKILL.md": `---\nname: proto-forge\ndescription: "Scaffolds apps."\n---\n\n# proto-forge\n` }),
  { pass: false, matching: /description/ },
);

expect(
  "skill-lint: a pointer outside the repository fails",
  "skill-lint.mjs",
  rootOnly({ "SKILL.md": `${goodSkill}\nRecorded in \`~/work/docs/spec.md\`.\n` }),
  { pass: false, matching: /outside this repository/ },
);

expect(
  "skill-lint: the documented install path is not a dangling pointer",
  "skill-lint.mjs",
  rootOnly({ "README.md": "Run `cp -R proto-forge ~/.claude/skills/proto-forge` to install.\n" }),
  { pass: true },
);

expect(
  "skill-lint: a decision record may quote the pointer it removed, once declared",
  "skill-lint.mjs",
  rootOnly({
    "docs/adr/002-thing.md":
      "<!-- historical-pointers: this record quotes the path it removed -->\n\n" +
      "The manifest used to live in `~/work/agentic-os/plugins/proto-forge`.\n",
  }),
  { pass: true },
);

expect(
  "skill-lint: the historical-pointers escape does not work outside docs/adr",
  "skill-lint.mjs",
  rootOnly({
    "SKILL.md": `${goodSkill}\n<!-- historical-pointers: trying to opt the skill out -->\n\nSee \`~/work/docs/spec.md\`.\n`,
  }),
  { pass: false, matching: /outside this repository/ },
);

expect(
  "skill-lint: the escape needs a real reason, not a bare marker",
  "skill-lint.mjs",
  rootOnly({
    "docs/adr/002-thing.md": "<!-- historical-pointers: x -->\n\nSee `~/work/agentic-os`.\n",
  }),
  { pass: false, matching: /outside this repository/ },
);

// --- the skills[] register (ADR 008) --------------------------------------------

const secondSkill = (name = "discovery") => `---
name: ${name}
description: "Turns a brief plus optional Figma links into per-unit gap-analysis documents with pre-allocated data-testids and a discovery.json bridge."
---

# ${name}
`;

const twoSkills = (over = {}) => ({
  "package.json": { name: "proto-forge", version: "0.4.0" },
  "SKILL.md": goodSkill,
  "skill.json": skillJson,
  ".claude-plugin/plugin.json": pluginJson(["./", "./skills/discovery"]),
  "skills/discovery/SKILL.md": secondSkill(),
  "skills/discovery/skill.json": { name: "discovery", version: "0.4.0", dependencies: {}, adr: [] },
  ...over,
});

/** The harness writes every entry it is given, so absence is expressed by removal. */
const omit = (files, ...keys) => {
  const copy = { ...files };
  for (const k of keys) delete copy[k];
  return copy;
};

expect("skill-lint: a second skill with matching manifests passes", "skill-lint.mjs", twoSkills(), { pass: true });

expect(
  "skill-lint: a skills entry with no skill.json fails",
  "skill-lint.mjs",
  omit(twoSkills(), "skills/discovery/skill.json"),
  { pass: false, matching: /skill\.json/ },
);

expect(
  "skill-lint: two skills sharing a name fail",
  "skill-lint.mjs",
  omit(
    {
      ...twoSkills(),
      ".claude-plugin/plugin.json": pluginJson(["./", "./skills/proto-forge"]),
      "skills/proto-forge/SKILL.md": secondSkill("proto-forge"),
      "skills/proto-forge/skill.json": { name: "proto-forge", version: "0.4.0", dependencies: {}, adr: [] },
    },
    "skills/discovery/SKILL.md",
    "skills/discovery/skill.json",
  ),
  { pass: false, matching: /claimed by both/ },
);

expect(
  "skill-lint: a skill whose dir basename disagrees with its name fails",
  "skill-lint.mjs",
  twoSkills({
    "skills/discovery/SKILL.md": secondSkill("gap-hunter"),
    "skills/discovery/skill.json": { name: "gap-hunter", version: "0.4.0", dependencies: {}, adr: [] },
  }),
  { pass: false, matching: /basename/ },
);

expect(
  "skill-lint: a second skill whose version disagrees with the root fails",
  "skill-lint.mjs",
  twoSkills({ "skills/discovery/skill.json": { name: "discovery", version: "0.9.9", dependencies: {}, adr: [] } }),
  { pass: false, matching: /version/ },
);

expect(
  "skill-lint: an out-of-repo pointer in a skill reference fails",
  "skill-lint.mjs",
  twoSkills({ "skills/discovery/references/notes.md": "The table came from `~/work/private/spec.md`.\n" }),
  { pass: false, matching: /outside this repository/ },
);

report();

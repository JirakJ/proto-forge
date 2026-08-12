import { expect, report } from "./selftest.mjs";

// Proves skill-lint rejects what it claims to: a name that disagrees with
// skill.json, missing frontmatter, and a pointer to a file outside the repo —
// the defect that made the shipped skill non-standalone.

const goodSkill = `---
name: proto-forge
description: "Use when the user wants to scaffold or build a new web-app prototype, MVP, or first shippable product slice from a short brief."
---

# proto-forge
`;
const skillJson = { name: "proto-forge", version: "0.4.0", dependencies: {}, adr: [] };

expect(
  "skill-lint: a well-formed skill passes",
  "skill-lint.mjs",
  { "SKILL.md": goodSkill, "skill.json": skillJson },
  { pass: true },
);

expect(
  "skill-lint: a name mismatch fails",
  "skill-lint.mjs",
  { "SKILL.md": goodSkill, "skill.json": { ...skillJson, name: "other" } },
  { pass: false, matching: /name/ },
);

expect(
  "skill-lint: missing frontmatter fails",
  "skill-lint.mjs",
  { "SKILL.md": "# proto-forge\n", "skill.json": skillJson },
  { pass: false, matching: /frontmatter/ },
);

expect(
  "skill-lint: a description too short to trigger reliably fails",
  "skill-lint.mjs",
  {
    "SKILL.md": `---\nname: proto-forge\ndescription: "Scaffolds apps."\n---\n\n# proto-forge\n`,
    "skill.json": skillJson,
  },
  { pass: false, matching: /description/ },
);

expect(
  "skill-lint: a pointer outside the repository fails",
  "skill-lint.mjs",
  { "SKILL.md": `${goodSkill}\nRecorded in \`~/work/docs/spec.md\`.\n`, "skill.json": skillJson },
  { pass: false, matching: /outside this repository/ },
);

expect(
  "skill-lint: the documented install path is not a dangling pointer",
  "skill-lint.mjs",
  {
    "SKILL.md": goodSkill,
    "skill.json": skillJson,
    "README.md": "Run `cp -R proto-forge ~/.claude/skills/proto-forge` to install.\n",
  },
  { pass: true },
);

expect(
  "skill-lint: a decision record may quote the pointer it removed, once declared",
  "skill-lint.mjs",
  {
    "SKILL.md": goodSkill,
    "skill.json": skillJson,
    "docs/adr/002-thing.md":
      "<!-- historical-pointers: this record quotes the path it removed -->\n\n" +
      "The manifest used to live in `~/work/agentic-os/plugins/proto-forge`.\n",
  },
  { pass: true },
);

expect(
  "skill-lint: the historical-pointers escape does not work outside docs/adr",
  "skill-lint.mjs",
  {
    "SKILL.md": `${goodSkill}\n<!-- historical-pointers: trying to opt the skill out -->\n\nSee \`~/work/docs/spec.md\`.\n`,
    "skill.json": skillJson,
  },
  { pass: false, matching: /outside this repository/ },
);

expect(
  "skill-lint: the escape needs a real reason, not a bare marker",
  "skill-lint.mjs",
  {
    "SKILL.md": goodSkill,
    "skill.json": skillJson,
    "docs/adr/002-thing.md": "<!-- historical-pointers: x -->\n\nSee `~/work/agentic-os`.\n",
  },
  { pass: false, matching: /outside this repository/ },
);

report();

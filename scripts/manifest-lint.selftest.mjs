import { expect, report } from "./selftest.mjs";

// Four manifests carry the plugin's identity: skill.json (the engine),
// plugin/.claude-plugin/plugin.json (the installable), .claude-plugin/
// marketplace.json (the listing) and package.json (the gates). A release bumps
// all four; this gate proves they never drift apart in between.

const files = (over = {}) => ({
  // plugin.json's skills[] must resolve to a real SKILL.md, so the fixture repo
  // needs one at the root the entry points back to.
  "SKILL.md": "---\nname: proto-forge\ndescription: d\n---\n",
  "package.json": { name: "proto-forge", version: "0.4.0", private: true },
  "skill.json": { name: "proto-forge", version: "0.4.0", dependencies: {}, adr: [] },
  "plugin/.claude-plugin/plugin.json": {
    name: "proto-forge",
    version: "0.4.0",
    description: "d",
    skills: ["../.."],
  },
  ".claude-plugin/marketplace.json": {
    name: "proto-forge",
    plugins: [{ name: "proto-forge", source: "./plugin", version: "0.4.0" }],
  },
  ...over,
});

expect("manifest-lint: agreeing manifests pass", "manifest-lint.mjs", files(), { pass: true });

expect(
  "manifest-lint: a version disagreement between skill.json and plugin.json fails",
  "manifest-lint.mjs",
  files({ "skill.json": { name: "proto-forge", version: "0.3.0", dependencies: {}, adr: [] } }),
  { pass: false, matching: /version/ },
);

expect(
  "manifest-lint: a version disagreement in package.json fails",
  "manifest-lint.mjs",
  files({ "package.json": { name: "proto-forge", version: "0.3.9", private: true } }),
  { pass: false, matching: /version/ },
);

expect(
  "manifest-lint: a name disagreement fails",
  "manifest-lint.mjs",
  files({
    "plugin/.claude-plugin/plugin.json": {
      name: "other-forge",
      version: "0.4.0",
      description: "d",
      skills: ["../.."],
    },
  }),
  { pass: false, matching: /name/ },
);

expect(
  "manifest-lint: an empty marketplace listing fails",
  "manifest-lint.mjs",
  files({ ".claude-plugin/marketplace.json": { name: "proto-forge", plugins: [] } }),
  { pass: false, matching: /exactly one/ },
);

expect(
  "manifest-lint: a marketplace source that resolves to nothing fails",
  "manifest-lint.mjs",
  files({
    ".claude-plugin/marketplace.json": {
      name: "proto-forge",
      plugins: [{ name: "proto-forge", source: "./nowhere", version: "0.4.0" }],
    },
  }),
  { pass: false, matching: /nowhere/ },
);

expect(
  "manifest-lint: a skills entry that resolves to no SKILL.md fails",
  "manifest-lint.mjs",
  files({
    "plugin/.claude-plugin/plugin.json": {
      name: "proto-forge",
      version: "0.4.0",
      description: "d",
      skills: ["../../elsewhere"],
    },
  }),
  { pass: false, matching: /SKILL\.md/ },
);

expect(
  "manifest-lint: a missing manifest fails rather than being skipped",
  "manifest-lint.mjs",
  (() => {
    const f = files();
    delete f[".claude-plugin/marketplace.json"];
    return f;
  })(),
  { pass: false, matching: /marketplace\.json/ },
);

report();

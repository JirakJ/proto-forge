import { expect, report } from "./selftest.mjs";

// Four manifests carry the plugin's identity: skill.json (the engine),
// .claude-plugin/plugin.json (the installable), .claude-plugin/
// marketplace.json (the listing) and package.json (the gates). A release bumps
// all four; this gate proves they never drift apart in between.

// The complete shape a registry entry demands — the smallest tree that counts as
// a template (manifest-lint's registry section enforces exactly this list).
const templateShape = (dir) => ({
  [`${dir}/package.json`]: { scripts: { verify: "true" } },
  [`${dir}/scripts/gates-selftest.mjs`]: "// selftest\n",
  [`${dir}/scripts/snapshot-diff.mjs`]: "// gate\n",
  [`${dir}/.proto-forge/seed.lock`]: "{}\n",
  [`${dir}/.proto-forge/snapshot.json`]: "{}\n",
  [`${dir}/.proto-forge/config.json`]: "{}\n",
  [`${dir}/.proto-forge/config.schema.json`]: "{}\n",
  [`${dir}/docs/adr/001-a.md`]: "# ADR 001: A\n\n- Status: accepted\n",
});

const files = (over = {}) => ({
  // plugin.json's skills[] must resolve to a real SKILL.md, so the fixture repo
  // needs one at the root the entry points back to.
  "SKILL.md": "---\nname: proto-forge\ndescription: d\n---\n",
  "package.json": { name: "proto-forge", version: "0.4.0", private: true },
  "skill.json": { name: "proto-forge", version: "0.4.0", dependencies: {}, adr: [] },
  ".claude-plugin/plugin.json": {
    name: "proto-forge",
    version: "0.4.0",
    description: "d",
    skills: ["./"],
  },
  ".claude-plugin/marketplace.json": {
    name: "proto-forge",
    plugins: [{ name: "proto-forge", source: "./", version: "0.4.0" }],
  },
  "references/templates.json": {
    templates: [{ id: "web", dir: "templates/web", kind: "frontend", stack: "ts", notAGate: [] }],
  },
  ...templateShape("templates/web"),
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
    ".claude-plugin/plugin.json": {
      name: "other-forge",
      version: "0.4.0",
      description: "d",
      skills: ["./"],
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
    ".claude-plugin/plugin.json": {
      name: "proto-forge",
      version: "0.4.0",
      description: "d",
      skills: ["./elsewhere"],
    },
  }),
  { pass: false, matching: /SKILL\.md/ },
);

expect(
  "manifest-lint: a skills entry escaping the plugin root fails even when it resolves",
  "manifest-lint.mjs",
  files({
    ".claude-plugin/plugin.json": {
      name: "proto-forge",
      version: "0.4.0",
      description: "d",
      skills: ["../.."],
    },
  }),
  { pass: false, matching: /must start with "\.\/"/ },
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

// --- the template registry (ADR 007) -------------------------------------------

expect(
  "manifest-lint: a missing template registry fails",
  "manifest-lint.mjs",
  (() => {
    const f = files();
    delete f["references/templates.json"];
    return f;
  })(),
  { pass: false, matching: /templates\.json/ },
);

expect(
  "manifest-lint: a registry entry pointing at a half-template fails",
  "manifest-lint.mjs",
  (() => {
    const f = files();
    delete f["templates/web/.proto-forge/seed.lock"];
    return f;
  })(),
  { pass: false, matching: /seed\.lock/ },
);

expect(
  "manifest-lint: a template without a verify script fails",
  "manifest-lint.mjs",
  files({ "templates/web/package.json": { scripts: { build: "true" } } }),
  { pass: false, matching: /verify/ },
);

expect(
  "manifest-lint: two registry entries sharing an id fail",
  "manifest-lint.mjs",
  files({
    "references/templates.json": {
      templates: [
        { id: "web", dir: "templates/web", kind: "frontend", stack: "ts", notAGate: [] },
        { id: "web", dir: "templates/web", kind: "frontend", stack: "ts", notAGate: [] },
      ],
    },
  }),
  { pass: false, matching: /duplicate/ },
);

expect(
  "manifest-lint: an unknown template kind fails",
  "manifest-lint.mjs",
  files({
    "references/templates.json": {
      templates: [{ id: "web", dir: "templates/web", kind: "mobile", stack: "ts", notAGate: [] }],
    },
  }),
  { pass: false, matching: /mobile/ },
);

report();

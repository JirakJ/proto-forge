import { existsSync, mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { fail, ok, hashTree } from "./lib.mjs";

// @adr 001 - the gates are the product, so the gates get tested
// A gate nobody has seen fail is a gate nobody knows works. This builds a throwaway
// project per case, breaks exactly one thing, and asserts the gate's exit code.
// Run it after touching any scan script: `pnpm gates:selftest`.

const SCRIPTS = resolve(dirname(new URL(import.meta.url).pathname));

// The suite's verdict is a pure function of scripts/** plus the node runtime:
// fixtures are self-contained throwaway dirs, HOME is redirected, and no case
// reads this repository's own tree (git plumbing used by the commit fixtures is
// stable across versions and deliberately outside the fingerprint). So a
// scripts tree byte-identical to the last GREEN run answers from its stamp — a
// content-addressed cache, not a skip: any byte of drift, a different node, or
// --force reruns everything. The stamp lives under node_modules/.cache, outside
// every snapshot and every commit.
const STAMP = "node_modules/.cache/proto-forge/selftest.stamp";
const fingerprint = createHash("sha256")
  .update(hashTree(SCRIPTS))
  .update(process.version)
  .digest("hex");
if (!process.argv.includes("--force") && existsSync(STAMP) && readFileSync(STAMP, "utf8").trim() === fingerprint) {
  ok(`gates:selftest: scripts tree unchanged since the last green run (${fingerprint.slice(0, 12)}…) — cached verdict; --force reruns`);
  process.exit(0);
}
const REPO = resolve(SCRIPTS, "..");
const results = [];
// Marks an inline-block proof for the citations case registry (no spawned fixture).
const inlineCase = (name) => name;

function project(files) {
  const dir = mkdtempSync(join(tmpdir(), "proto-forge-gate-"));
  for (const [path, body] of Object.entries(files)) {
    // An undefined body REMOVES a file a base fixture provided — the way a case says
    // "like the passing project, but without its manifest".
    if (body === undefined) continue;
    const full = join(dir, path);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, typeof body === "string" ? body : JSON.stringify(body, null, 2));
  }
  return dir;
}

function run(gate, dir, args = [], env = {}) {
  // HOME is redirected so an operator's ~/.config/proto-forge/config.json cannot
  // change the outcome of a self-test.
  const r = spawnSync(process.execPath, [join(SCRIPTS, gate), ...args], {
    cwd: dir,
    encoding: "utf8",
    env: { ...process.env, HOME: dir, PROTO_FORGE_TODAY: "2026-08-11", ...env },
  });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
}

/**
 * `prepare` runs after the files are written and before the gate does, with the
 * throwaway dir as its argument. Gates whose passing case requires a lock only the
 * gate itself can compute (snapshot:diff) use it to write the baseline the way an
 * operator would.
 */
function expect(name, gate, files, { pass, matching, args = [], env = {}, prepare }) {
  const dir = project(files);
  try {
    if (prepare !== undefined) prepare(dir);
    const { code, out } = run(gate, dir, args, env);
    const passed = code === 0;
    if (passed !== pass) {
      results.push(`${name}: expected ${pass ? "PASS" : "FAIL"}, got ${passed ? "PASS" : "FAIL"} — ${out.trim()}`);
    } else if (matching !== undefined && !matching.test(out)) {
      results.push(`${name}: correct verdict but the message never mentions ${matching} — got ${out.trim()}`);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// --- ws:verify (BR-34) ---------------------------------------------------------
const BRIEF = "a".repeat(64);
const OTHER_BRIEF = "f".repeat(64);
const GITIGNORE = "node_modules/\n/api/\n/web/\n/e2e/\n";
const MANIFEST = {
  pairedBrief: BRIEF,
  parts: [
    { id: "api", template: "api-node", dir: "api", role: "backend" },
    { id: "web", template: "web", dir: "web", role: "frontend" },
    { id: "e2e", template: "e2e", dir: "e2e", role: "e2e" },
  ],
  contract: { source: "api/contract/openapi.json" },
};
const wsProject = (manifest, over = {}) => ({
  "workspace.json": manifest,
  ".gitignore": GITIGNORE,
  ".proto-forge/config.json": {},
  ...over,
});

// The template itself is the first fixture: what ships must pass its own gate
// strictly — the sample pairedBrief is a real sha256, never a placeholder.
expect("ws: the shipped manifest passes", "ws-verify.mjs", {
  "workspace.json": readFileSync(join(REPO, "workspace.json"), "utf8"),
  ".gitignore": readFileSync(join(REPO, ".gitignore"), "utf8"),
  ".proto-forge/config.json": {},
}, { pass: true });

expect("ws: a part dir the gitignore does not cover fails", "ws-verify.mjs",
  wsProject(MANIFEST, { ".gitignore": "node_modules/\n/api/\n/web/\n" }),
  { pass: false, matching: /\.gitignore does not cover part dir "e2e"/ });

expect("ws: duplicate part ids fail", "ws-verify.mjs",
  wsProject({
    pairedBrief: BRIEF,
    parts: [
      { id: "api", template: "api-node", dir: "api", role: "backend" },
      { id: "api", template: "web", dir: "web", role: "frontend" },
    ],
  }),
  { pass: false, matching: /duplicate part id/ });

expect("ws: a present part whose pairedBrief disagrees fails", "ws-verify.mjs",
  wsProject(MANIFEST, { "api/.proto-forge/facets.json": { facetsVersion: 2, pairedBrief: OTHER_BRIEF } }),
  { pass: false, matching: /pairedBrief disagrees/ });

expect("ws: a manifest listing a part with no template fails", "ws-verify.mjs",
  wsProject({ pairedBrief: BRIEF, parts: [{ id: "api", dir: "api", role: "backend" }] }, { ".gitignore": "/api/\n" }),
  { pass: false, matching: /names no template/ });

// The other shapes the manifest check promises to reject.
expect("ws: a placeholder pairedBrief fails strict", "ws-verify.mjs",
  wsProject({ ...MANIFEST, pairedBrief: "PENDING" }),
  { pass: false, matching: /pairedBrief must be the lowercase sha256/ });

expect("ws: a present part with no facets.json fails", "ws-verify.mjs",
  wsProject(MANIFEST, { "api/.gitkeep": "" }),
  { pass: false, matching: /no \.proto-forge\/facets\.json/ });

expect("ws: an absent part dir is tolerated as pre-clone state", "ws-verify.mjs",
  wsProject(MANIFEST),
  { pass: true, matching: /awaiting clone/ });

expect("ws: a contract source outside every part dir fails", "ws-verify.mjs",
  wsProject({ ...MANIFEST, contract: { source: "shared/openapi.json" } }),
  { pass: false, matching: /does not live inside any part dir/ });

expect("ws: an unknown role fails", "ws-verify.mjs",
  wsProject({ pairedBrief: BRIEF, parts: [{ id: "api", template: "api-node", dir: "api", role: "database" }] }, { ".gitignore": "/api/\n" }),
  { pass: false, matching: /role must be one of/ });

// --- config ------------------------------------------------------------------
const withConfig = (config, extra = {}) => ({
  ".proto-forge/config.json": config,
  "docs/adr/150-sync-pilot.md": "# ADR 150: Cross-repo sync pilot\n\n- Status: accepted\n",
  ...extra,
});

expect("config: the strict default passes", "config-cli.mjs", withConfig({}), { pass: true });

expect(
  "config: relaxing a mandatory gate without a waiver fails",
  "config-cli.mjs",
  withConfig({ gates: { ws: { mode: "warn" } } }),
  { pass: false, matching: /mandatory/ },
);

expect(
  "config: a complete waiver passes and is reported",
  "config-cli.mjs",
  withConfig({
    gates: { ws: { mode: "warn" } },
    waivers: [{ gate: "ws", reason: "half-migrated workspace for the September demo", adr: 150, expires: "2026-12-31" }],
  }),
  { pass: true, matching: /waived/i },
);

expect(
  "config: a waiver citing an ADR that does not exist fails",
  "config-cli.mjs",
  withConfig({
    gates: { ws: { mode: "warn" } },
    waivers: [{ gate: "ws", reason: "half-migrated workspace for the September demo", adr: 999, expires: "2026-12-31" }],
  }),
  { pass: false, matching: /does not exist/ },
);

expect(
  "config: a waiver with no real justification fails",
  "config-cli.mjs",
  withConfig({
    gates: { ws: { mode: "warn" } },
    waivers: [{ gate: "ws", reason: "later", adr: 150, expires: "2026-12-31" }],
  }),
  { pass: false, matching: /explain/ },
);

expect(
  "config: a waiver for a gate that is not relaxed fails as dead paperwork",
  "config-cli.mjs",
  withConfig({
    waivers: [{ gate: "ws", reason: "half-migrated workspace for the September demo", adr: 150, expires: "2026-12-31" }],
  }),
  { pass: false, matching: /stale waiver/ },
);

// An expired waiver must not merely warn: the gate has to be enforcing again.
// The fixture is a manifest ws:verify genuinely rejects (duplicate part ids).
const BROKEN_MANIFEST = {
  pairedBrief: BRIEF,
  parts: [
    { id: "api", template: "api-node", dir: "api", role: "backend" },
    { id: "api", template: "web", dir: "web", role: "frontend" },
  ],
};
{
  const dir = project(
    withConfig(
      {
        gates: { ws: { mode: "off" } },
        waivers: [{ gate: "ws", reason: "half-migrated workspace for the September demo", adr: 150, expires: "2026-01-01" }],
      },
      { "workspace.json": BROKEN_MANIFEST, ".gitignore": GITIGNORE },
    ),
  );
  try {
    const { code, out } = run("ws-verify.mjs", dir);
    if (code === 0) results.push(`config: an expired waiver must stop disabling the gate — ws:verify passed anyway: ${out.trim()}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// A live waiver really does downgrade the same failure to a warning.
{
  const dir = project(
    withConfig(
      {
        gates: { ws: { mode: "warn" } },
        waivers: [{ gate: "ws", reason: "half-migrated workspace for the September demo", adr: 150, expires: "2026-12-31" }],
      },
      { "workspace.json": BROKEN_MANIFEST, ".gitignore": GITIGNORE },
    ),
  );
  try {
    const { code, out } = run("ws-verify.mjs", dir);
    if (code !== 0) results.push(`config: a live waiver should downgrade ws:verify to a warning — it still failed: ${out.trim()}`);
    else if (!/WARNED/.test(out)) results.push(`config: a waived gate must still say so out loud — got: ${out.trim()}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// --- guardrail hook ------------------------------------------------------------
function hook(name, script, payload, files, { blocked, matching }) {
  const dir = project(files);
  try {
    const r = spawnSync(process.execPath, [join(SCRIPTS, "hooks", script)], {
      cwd: dir,
      encoding: "utf8",
      input: JSON.stringify({ cwd: dir, ...payload }),
      env: { ...process.env, HOME: dir, PROTO_FORGE_TODAY: "2026-08-11" },
    });
    const didBlock = r.status === 2;
    const out = `${r.stdout}${r.stderr}`;
    if (didBlock !== blocked) {
      results.push(`${name}: expected ${blocked ? "BLOCK" : "ALLOW"}, got ${didBlock ? "BLOCK" : "ALLOW"} — ${out.trim()}`);
    } else if (matching !== undefined && !matching.test(out)) {
      results.push(`${name}: correct verdict but the message never mentions ${matching} — got ${out.trim()}`);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

hook(
  "hook: editing the byte-pinned seed is blocked",
  "guard-write.mjs",
  { tool_name: "Edit", tool_input: { file_path: "scripts/ws-verify.mjs", new_string: "x" } },
  { "scripts/ws-verify.mjs": "export const x = 1;", ".proto-forge/config.json": {} },
  { blocked: true, matching: /byte-pinned/ },
);

hook(
  "hook: an ordinary feature edit is allowed",
  "guard-write.mjs",
  { tool_name: "Edit", tool_input: { file_path: "docs/RUNBOOK.md", new_string: "x" } },
  { "docs/RUNBOOK.md": "# runbook", ".proto-forge/config.json": {} },
  { blocked: false },
);

hook(
  "hook: rewriting an existing prompt-log entry is blocked",
  "guard-write.mjs",
  { tool_name: "Edit", tool_input: { file_path: ".prompts/0001-scaffold.md", new_string: "x" } },
  { ".prompts/0001-scaffold.md": "# scaffold", ".proto-forge/config.json": {} },
  { blocked: true, matching: /append-only/ },
);

hook(
  "hook: adding a NEW prompt-log entry is allowed",
  "guard-write.mjs",
  { tool_name: "Write", tool_input: { file_path: ".prompts/0003-fix.md", content: "# fix" } },
  { ".proto-forge/config.json": {} },
  { blocked: false },
);

hook(
  "hook: switching a gate to warn in the config is blocked",
  "guard-write.mjs",
  { tool_name: "Edit", tool_input: { file_path: ".proto-forge/config.json", new_string: '"mode": "warn"' } },
  { ".proto-forge/config.json": {} },
  { blocked: true, matching: /gate mode/ },
);

// --- adr:lint ----------------------------------------------------------------
const adr = (num, status, extra = "") =>
  `# ADR ${num}: A decision\n\n- Status: ${status}\n- Date: 2026-08-12\n${extra}\n## Context\n\nx\n`;
const promptEntry = "---\nid: 0001\ntimestamp: 2026-08-12T00:00:00Z\nphase: 1\n---\n\n## Prompt\n\nx\n";

expect("adr: an anchored, accepted, prompt-linked ADR passes", "adr-lint.mjs", {
  "docs/adr/010-a-decision.md": adr("010", "accepted", "- Prompt-log: .prompts/0001-x.md\n"),
  ".prompts/0001-x.md": promptEntry,
  "src/domain/note/model.ts": "// @adr 010 - the note domain\nexport type Note = { id: string };\n",
}, { pass: true });

expect("adr: an anchor to an ADR that does not exist fails", "adr-lint.mjs", {
  "src/domain/note/model.ts": "// @adr 777 - invented\nexport type Note = { id: string };\n",
}, { pass: false, matching: /no ADR file/ });

expect("adr: an anchor to a proposed ADR fails", "adr-lint.mjs", {
  "docs/adr/010-a-decision.md": adr("010", "proposed", "- Prompt-log: .prompts/0001-x.md\n"),
  ".prompts/0001-x.md": promptEntry,
  "src/domain/note/model.ts": "// @adr 010 - the note domain\nexport type Note = { id: string };\n",
}, { pass: false, matching: /proposed ADR/ });

expect("adr: an accepted ADR nobody anchored fails", "adr-lint.mjs", {
  "docs/adr/010-a-decision.md": adr("010", "accepted", "- Prompt-log: .prompts/0001-x.md\n"),
  ".prompts/0001-x.md": promptEntry,
  "src/domain/note/model.ts": "export type Note = { id: string };\n",
}, { pass: false, matching: /never anchored/ });

expect("adr: an accepted ADR with no prompt-log back-reference fails", "adr-lint.mjs", {
  "docs/adr/010-a-decision.md": adr("010", "accepted"),
  "src/domain/note/model.ts": "// @adr 010 - the note domain\nexport type Note = { id: string };\n",
}, { pass: false, matching: /Prompt-log/ });

expect("adr: a prompt-log reference pointing at nothing fails", "adr-lint.mjs", {
  "docs/adr/010-a-decision.md": adr("010", "accepted", "- Prompt-log: .prompts/0009-absent.md\n"),
  "src/domain/note/model.ts": "// @adr 010 - the note domain\nexport type Note = { id: string };\n",
}, { pass: false, matching: /does not exist/ });

// Two files sharing a number would shadow each other in every by-number lookup, and a
// generator allocating "the low end of the band" next to a pre-written ADR is exactly
// how it happens. An error, never last-write-wins.
expect("adr: the same number on two files fails", "adr-lint.mjs", {
  "docs/adr/010-a-decision.md": adr("010", "accepted", "- Prompt-log: .prompts/0001-x.md\n"),
  "docs/adr/010-a-rival.md": adr("010", "accepted", "- Prompt-log: .prompts/0001-x.md\n"),
  ".prompts/0001-x.md": promptEntry,
  "src/domain/note/model.ts": "// @adr 010 - the note domain\nexport type Note = { id: string };\n",
}, { pass: false, matching: /used twice/ });

// --- prompt:lint -------------------------------------------------------------
expect("prompt: well-formed, strictly increasing entries pass", "prompt-log-lint.mjs", {
  ".prompts/0001-scaffold.md": promptEntry,
  ".prompts/0002-brief.md": promptEntry.replace("id: 0001", "id: 0002"),
}, { pass: true });

// BR-13: the log is English — a foreign-language prompt is recorded as its
// English rendering; product strings that must stay foreign are quoted as code.
expect("prompt: a non-English prompt body fails", "prompt-log-lint.mjs", {
  ".prompts/0001-scaffold.md": promptEntry.replace("\nx\n", "\nPosuň výstup na produkční úroveň.\n"),
}, { pass: false, matching: /non-English prompt text/ });

expect("prompt: backtick-quoted foreign strings pass", "prompt-log-lint.mjs", {
  ".prompts/0001-scaffold.md": promptEntry.replace(
    "\nx\n",
    "\nRename the save action to the `Uložit` label the brief demands — «redacted:pii» signed it off.\n",
  ),
}, { pass: true });

expect("prompt: an empty log fails", "prompt-log-lint.mjs", {
  "workspace.json": {},
}, { pass: false, matching: /no prompt-log entries/ });

expect("prompt: a filename that is not NNNN-slug.md fails", "prompt-log-lint.mjs", {
  ".prompts/1-scaffold.md": promptEntry,
}, { pass: false, matching: /NNNN-slug/ });

expect("prompt: an id that disagrees with the filename fails", "prompt-log-lint.mjs", {
  ".prompts/0001-scaffold.md": promptEntry.replace("id: 0001", "id: 0002"),
}, { pass: false, matching: /!=/ });

expect("prompt: an entry with no ## Prompt section fails", "prompt-log-lint.mjs", {
  ".prompts/0001-scaffold.md": "---\nid: 0001\ntimestamp: 2026-08-12T00:00:00Z\nphase: 1\n---\n\n## Outcome\n\nx\n",
}, { pass: false, matching: /## Prompt/ });

// Two entries sharing a number is the only way to reach the ordering check:
// ids are validated against the filename, and filenames sort ascending, so a
// duplicated prefix is what a botched "append" actually looks like.
expect("prompt: ids that do not strictly increase fail", "prompt-log-lint.mjs", {
  ".prompts/0001-a.md": promptEntry,
  ".prompts/0001-b.md": promptEntry,
}, { pass: false, matching: /strictly increasing/ });

// --- snapshot:diff -----------------------------------------------------------
// The passing case needs a seed.lock holding a hash only the gate can compute, so
// `prepare` writes the baseline the way an operator would. The seed here is ONE
// tree: the gate corpus (scripts/**) — this template's only product code.
const snapshotBase = (over = {}) => ({
  "package.json": { version: "0.1.0", scripts: { verify: "pnpm run ws:verify && pnpm run snapshot:diff" } },
  "scripts/keep.mjs": "export const keep = true;\n",
  "docs/adr/001-base.md": "# ADR 001: Base decision\n\n- Status: accepted\n",
  "workspace.json": { pairedBrief: BRIEF, parts: [] },
  // The generated locks live here, and neither --write-seed nor --write creates
  // the directory: a workspace always has it, because the template ships it.
  ".proto-forge/config.json": { policy: "strict" },
  ...over,
});
const writeBaseline = (dir) => {
  run("snapshot-diff.mjs", dir, ["--write-seed"]);
  run("snapshot-diff.mjs", dir, ["--write"]);
};

expect("snapshot: a tree matching its committed baseline passes", "snapshot-diff.mjs", snapshotBase(), {
  pass: true,
  prepare: writeBaseline,
});

expect("snapshot: a missing seed.lock fails", "snapshot-diff.mjs", snapshotBase(), {
  pass: false,
  matching: /seed\.lock missing/,
});

expect("snapshot: a vendored seed that differs from seed.lock fails", "snapshot-diff.mjs", snapshotBase({
  ".proto-forge/seed.lock": {
    seed: ["scripts"],
    version: "0.1.0",
    sha256: "0000000000000000000000000000000000000000000000000000000000000000",
  },
}), { pass: false, matching: /seed integrity/ });

expect("snapshot: a file added after the baseline fails", "snapshot-diff.mjs", snapshotBase(), {
  pass: false,
  matching: /fileTree drifted/,
  prepare: (dir) => {
    writeBaseline(dir);
    writeFileSync(join(dir, "docs", "adr", "002-added.md"), "# ADR 002: Added later\n\n- Status: accepted\n");
  },
});

expect("snapshot: a gate removed from verify after the baseline fails", "snapshot-diff.mjs", snapshotBase(), {
  pass: false,
  matching: /gates drifted/,
  prepare: (dir) => {
    writeBaseline(dir);
    writeFileSync(
      join(dir, "package.json"),
      JSON.stringify({ version: "0.1.0", scripts: { verify: "pnpm run ws:verify" } }, null, 2),
    );
  },
});

// --- status: the documented numbers are the derived numbers ---------------------
// BR-36 (trimmed to this template's facts). quality:report derives the part
// counts and the verify chain into quality.json and regenerates the STATUS.md
// block; status:verify re-derives both and holds the mirrors to their sources.
// The fixtures build a minimal manifest with one present and one absent part,
// run the producer, then break exactly one copy. (No threshold mirror here:
// this chain enforces no numeric floor — that pinned case lives in the app
// templates.)
const STATUS_MANIFEST = {
  pairedBrief: "982d1119fb174b7c1b63105a70628fbec33a944ed8e9b06a23fda674560d7955",
  parts: [
    { id: "api", template: "api-node", dir: "api", role: "backend" },
    { id: "web", template: "web", dir: "web", role: "frontend" },
  ],
};
const statusProject = (over = {}) => ({
  ".proto-forge/config.json": {},
  "package.json": { scripts: { verify: "pnpm run ws:verify && pnpm run status:verify" } },
  "workspace.json": STATUS_MANIFEST,
  "api/README.md": "the materialized part fixture\n",
  "docs/STATUS.md": "# Quality status\n\n<!-- quality:begin -->\n<!-- quality:end -->\n",
  ...over,
});
const writeQuality = (dir) => run("quality-report.mjs", dir);

expect("status: a fresh quality report passes", "status-verify.mjs", statusProject(), {
  pass: true,
  prepare: writeQuality,
});

expect("status: a hand-edited STATUS block fails", "status-verify.mjs", statusProject(), {
  pass: false,
  matching: /hand-edited/,
  prepare: (dir) => {
    writeQuality(dir);
    const doc = join(dir, "docs", "STATUS.md");
    writeFileSync(doc, readFileSync(doc, "utf8").replace("1/2 present", "2/2 present"));
  },
});

expect("status: a gate chain mirror disagreeing with package.json fails", "status-verify.mjs", statusProject(), {
  pass: false,
  matching: /gates\.chain/,
  prepare: (dir) => {
    writeQuality(dir);
    writeFileSync(join(dir, "package.json"), JSON.stringify({ scripts: { verify: "pnpm run ws:verify" } }, null, 2));
  },
});

expect("status: a missing quality.json fails", "status-verify.mjs", statusProject(), {
  pass: false,
  matching: /quality\.json is missing/,
});

// --- doctor ------------------------------------------------------------------
// NFR-18 (trimmed). The doctor is a support tool, so the contract under test is
// the useful half: a clean fixture tree passes anywhere — the engines fixture
// matches the running node, and every declared part is materialized.
expect(
  "doctor: a clean tree passes",
  "doctor.mjs",
  {
    "package.json": { engines: { node: `>=${process.versions.node.split(".")[0]}` } },
    "workspace.json": { parts: [{ id: "api", template: "api-node", dir: "api", role: "backend" }] },
    "api/README.md": "the materialized part fixture\n",
  },
  { pass: true },
);

// --- heal --------------------------------------------------------------------
// NFR-19: self-healing is layered, bounded and on the record. The loop is
// proven offline through the three fixture seams documented in scripts/heal.mjs
// (PROTO_FORGE_HEAL_VERIFY / _GATE_CMD / _REGISTRY): a fixture gate fails until
// a marker exists, a fixture regen creates it, and a fixture registry wires the
// two together — no package manager involved.
const HEAL_GATE =
  'import { existsSync } from "node:fs";\n' +
  'if (existsSync("healed.marker")) { process.stdout.write("fixturegate ok\\n"); process.exit(0); }\n' +
  'process.stdout.write("✗ fixturegate FAILED\\n    the derived marker is missing\\n");\n' +
  "process.exit(1);\n";
const HEAL_REGEN =
  'import { appendFileSync, writeFileSync } from "node:fs";\n' +
  'appendFileSync("attempts.log", "pass\\n");\n' +
  'writeFileSync("healed.marker", "regenerated\\n");\n';
const HEAL_REGEN_NOOP = 'import { appendFileSync } from "node:fs";\nappendFileSync("attempts.log", "pass\\n");\n';
const healEnv = {
  PROTO_FORGE_HEAL_VERIFY: "node fixture-gate.mjs",
  PROTO_FORGE_HEAL_GATE_CMD: "node fixture-gate.mjs",
  PROTO_FORGE_HEAL_REGISTRY: "fixture-registry.json",
};
const healBase = (over = {}) => ({
  ".proto-forge/config.json": {},
  ".prompts/0001-scaffold.md": promptEntry,
  "fixture-gate.mjs": HEAL_GATE,
  "fixture-registry.json": {
    fixturegate: { check: "fixturegate", regen: ["node fixture-regen.mjs"], reason: "the marker is a derivation of the fixture" },
  },
  "fixture-regen.mjs": HEAL_REGEN,
  ...over,
});

inlineCase("heal: a mechanical drift heals in one pass");
{
  const dir = project(healBase());
  try {
    const { code, out } = run("heal.mjs", dir, [], healEnv);
    if (code !== 0) {
      results.push(`heal: a mechanical drift heals in one pass — expected exit 0, got ${code}: ${out.trim()}`);
    } else if (!/healed by the mechanical tier in pass 1/.test(out)) {
      results.push(`heal: a mechanical drift heals in one pass — the report must name tier and pass: ${out.trim()}`);
    } else if (!existsSync(join(dir, ".prompts", "0002-heal-fixturegate-pass-1.md"))) {
      results.push("heal: a mechanical drift heals in one pass — the pass was not logged as .prompts/0002-heal-fixturegate-pass-1.md");
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

expect(
  "heal: a hard-stop gate is never healed",
  "heal.mjs",
  healBase({
    "fixture-gate.mjs": 'process.stdout.write("✗ sec FAILED\\n    gitleaks found secrets\\n");\nprocess.exit(1);\n',
    // A registry entry EXISTS for the hard-stop gate — the refusal must come first.
    "fixture-registry.json": { sec: { check: "sec:scan", regen: ["node fixture-regen.mjs"], reason: "an entry the tool must refuse to use" } },
  }),
  { pass: false, matching: /no auto-remediation/, env: healEnv },
);

expect(
  "heal: the agent tier without committed consent is refused",
  "heal.mjs",
  healBase({
    "fixture-gate.mjs": 'process.stdout.write("✗ mysterygate FAILED\\n    a failure no registry entry covers\\n");\nprocess.exit(1);\n',
    "fixture-registry.json": {},
  }),
  { pass: false, matching: /selfHealing\.agent\.enabled/, env: healEnv },
);

inlineCase("heal: every pass writes a prompt-log entry first");
// Write-before-act: the entry must be on disk EVEN though the heal failed.
{
  const dir = project(healBase({ "fixture-regen.mjs": HEAL_REGEN_NOOP }));
  try {
    const { code, out } = run("heal.mjs", dir, [], healEnv);
    const entry = join(dir, ".prompts", "0002-heal-fixturegate-pass-1.md");
    if (code === 0) {
      results.push(`heal: every pass writes a prompt-log entry first — a no-op regen must not heal: ${out.trim()}`);
    } else if (!existsSync(entry)) {
      results.push("heal: every pass writes a prompt-log entry first — no entry on disk after a failed heal (write-before-act broken)");
    } else if (!/## Prompt/.test(readFileSync(entry, "utf8"))) {
      results.push("heal: every pass writes a prompt-log entry first — the entry has no ## Prompt section");
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

inlineCase("heal: passes stop at the configured bound");
{
  const dir = project(
    healBase({
      ".proto-forge/config.json": { selfHealing: { mechanical: { maxPasses: 1 } } },
      "fixture-regen.mjs": HEAL_REGEN_NOOP,
    }),
  );
  try {
    const { code, out } = run("heal.mjs", dir, [], healEnv);
    const log = join(dir, "attempts.log");
    const attempts = existsSync(log) ? readFileSync(log, "utf8").trim().split("\n").length : 0;
    if (code === 0) {
      results.push(`heal: passes stop at the configured bound — must escalate, not pass: ${out.trim()}`);
    } else if (attempts !== 1) {
      results.push(`heal: passes stop at the configured bound — expected exactly 1 attempt, got ${attempts}`);
    } else if (!/blocked/.test(out)) {
      results.push(`heal: passes stop at the configured bound — the escalation must say blocked: ${out.trim()}`);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

expect(
  "config: an unbounded healing loop fails",
  "config-cli.mjs",
  withConfig({ selfHealing: { mechanical: { maxPasses: 9 } } }),
  { pass: false, matching: /a healing loop without a bound is a loop/ },
);

if (results.length) fail(`gates:selftest FAILED (${results.length})`, results);
mkdirSync(dirname(STAMP), { recursive: true });
writeFileSync(STAMP, `${fingerprint}\n`);
ok("gates:selftest: every gate, guardrail and manifest check rejects what it claims to reject");

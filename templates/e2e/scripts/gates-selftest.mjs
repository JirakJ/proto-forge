import { existsSync, mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fail, ok } from "./lib.mjs";

// @adr 001 - the gates are the product, so the gates get tested
// A gate nobody has seen fail is a gate nobody knows works. This builds a throwaway
// project per case, breaks exactly one thing, and asserts the gate's exit code.
// Run it after touching any scan script: `pnpm gates:selftest`.

const SCRIPTS = resolve(dirname(new URL(import.meta.url).pathname));
const REPO = resolve(SCRIPTS, "..");
const results = [];
// Marks an inline-block proof for the citations case registry (no spawned fixture).
const inlineCase = (name) => name;

function project(files) {
  const dir = mkdtempSync(join(tmpdir(), "proto-forge-gate-"));
  for (const [path, body] of Object.entries(files)) {
    // An undefined body REMOVES a file a base fixture provided — the way a case says
    // "like the passing project, but without its generated spec".
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
 * operator would. `env` overrides the child environment — E2E_CONTRACT is the
 * documented seam that points the registry gate at a fixture contract.
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

// --- registry:verify (BR-35) ---------------------------------------------------
// A fixture contract mirroring the Note demo pair's operations, small enough to
// read: the registry gate only needs paths → operations → operationId.
const FIXTURE_CONTRACT = {
  openapi: "3.1.0",
  info: { title: "notes", version: "1.0.0" },
  paths: {
    "/notes": {
      get: { operationId: "notes-list", responses: { 200: { description: "ok" } } },
      post: { operationId: "notes-create", responses: { 201: { description: "created" } } },
    },
    "/notes/{id}": {
      get: { operationId: "notes-get", responses: { 200: { description: "ok" } } },
      delete: { operationId: "notes-delete", responses: { 204: { description: "gone" } } },
    },
  },
};

const flowCasesTs = (ids) =>
  `export const flowCases = [\n${ids.map((id) => `  { id: "${id}", title: "x", actor: "user", steps: ["one"] },`).join("\n")}\n];\n`;
const flowImplTs = (ids) =>
  `export const implementations = {\n${ids.map((id) => `  "${id}": async (page) => { await page.goto("/"); },`).join("\n")}\n};\n`;
const contractCasesTs = (cases) =>
  `export const contractCases = [\n${cases
    .map(
      (c) =>
        `  {\n    id: "${c.id}",\n    operationId: "${c.operationId}",\n    request: { method: "GET", path: "/notes" },\n    expectation: { status: 200 },\n  },`,
    )
    .join("\n")}\n];\n`;

const registryBase = (over = {}) => ({
  "src/flows/cases.ts": flowCasesTs(["notes-create-list-delete"]),
  "src/flows/notes.flow.ts": flowImplTs(["notes-create-list-delete"]),
  "src/contract/cases.ts": contractCasesTs([{ id: "notes-list-replies", operationId: "notes-list" }]),
  "e2e/flows.spec.ts": 'import { flowCases } from "../src/flows/cases";\n',
  "e2e/contract.spec.ts": 'import { contractCases } from "../src/contract/cases";\n',
  "contract.json": FIXTURE_CONTRACT,
  ".proto-forge/config.json": {},
  ...over,
});
const contractEnv = { E2E_CONTRACT: "contract.json" };

// The template itself is the first fixture: what ships must pass its own gate,
// including operation existence against a contract shaped like the demo pair's.
expect("e2e: the shipped registries pass", "registry-verify.mjs", {
  "src/flows/cases.ts": readFileSync(join(REPO, "src/flows/cases.ts"), "utf8"),
  "src/flows/notes.flow.ts": readFileSync(join(REPO, "src/flows/notes.flow.ts"), "utf8"),
  "src/contract/cases.ts": readFileSync(join(REPO, "src/contract/cases.ts"), "utf8"),
  "e2e/flows.spec.ts": readFileSync(join(REPO, "e2e/flows.spec.ts"), "utf8"),
  "e2e/contract.spec.ts": readFileSync(join(REPO, "e2e/contract.spec.ts"), "utf8"),
  "contract.json": FIXTURE_CONTRACT,
  ".proto-forge/config.json": {},
}, { pass: true, env: contractEnv });

expect("e2e: a contract case naming an unknown operation fails", "registry-verify.mjs",
  registryBase({ "src/contract/cases.ts": contractCasesTs([{ id: "notes-explode-replies", operationId: "notes-explode" }]) }),
  { pass: false, matching: /unknown operation "notes-explode"/, env: contractEnv });

expect("e2e: duplicate case ids fail", "registry-verify.mjs",
  registryBase({
    "src/contract/cases.ts": contractCasesTs([
      { id: "notes-list-replies", operationId: "notes-list" },
      { id: "notes-list-replies", operationId: "notes-list" },
    ]),
  }),
  { pass: false, matching: /duplicate case id/, env: contractEnv });

expect("e2e: a flow case with no spec coverage fails", "registry-verify.mjs",
  registryBase({
    "src/flows/cases.ts": flowCasesTs(["notes-create-list-delete", "notes-archive-restore"]),
  }),
  { pass: false, matching: /"notes-archive-restore" has no spec coverage/, env: contractEnv });

expect("e2e: an implementation with no registry case fails", "registry-verify.mjs",
  registryBase({
    "src/flows/notes.flow.ts": flowImplTs(["notes-create-list-delete", "notes-invented-flow"]),
  }),
  { pass: false, matching: /"notes-invented-flow" has no registry case/, env: contractEnv });

expect("e2e: a non-kebab case id fails", "registry-verify.mjs",
  registryBase({ "src/contract/cases.ts": contractCasesTs([{ id: "Notes_List", operationId: "notes-list" }]) }),
  { pass: false, matching: /not kebab-case/, env: contractEnv });

expect("e2e: a deleted generated spec fails", "registry-verify.mjs",
  registryBase({ "e2e/flows.spec.ts": undefined }),
  { pass: false, matching: /flows\.spec\.ts is missing/, env: contractEnv });

// Pre-workspace, the contract is legitimately absent: a printed note, never a
// silent pass and never a failure. (The fixture omits contract.json and the env.)
expect("e2e: an absent contract is tolerated with a note", "registry-verify.mjs",
  registryBase({ "contract.json": undefined }),
  { pass: true, matching: /pre-workspace state/ });

inlineCase("e2e: response validation rejects a shape the contract forbids");
// --- the shared response validator (BR-35) --------------------------------------
// Proven directly, in-process: the SAME implementation the Playwright suite
// imports through src/contract/validate.ts. One schema, one conforming body,
// then one violation per rule the subset claims to enforce.
{
  const { validateAgainstSchema } = await import("./validate-lib.mjs");
  const noteSchema = {
    type: "object",
    required: ["id", "text"],
    additionalProperties: false,
    properties: {
      id: { type: "string", format: "uuid" },
      text: { type: "string", minLength: 1 },
      status: { enum: ["active", "done"] },
    },
  };
  const conforming = { id: "3b9f2b6e-51a4-4222-8333-9c44a5556666", text: "x", status: "active" };
  const cases = [
    ["a conforming body passes", conforming, null],
    ["a missing required property is rejected", { id: conforming.id }, /required property "text"/],
    ["a mistyped property is rejected", { ...conforming, text: 5 }, /expected type string/],
    ["a property the contract forbids is rejected", { ...conforming, extra: 1 }, /additionalProperties/],
    ["an enum violation is rejected", { ...conforming, status: "archived" }, /not one of the enum/],
    ["a malformed uuid is rejected", { ...conforming, id: "not-a-uuid" }, /well-formed uuid/],
  ];
  for (const [what, value, expected] of cases) {
    const errors = validateAgainstSchema(noteSchema, value);
    if (expected === null && errors.length > 0) {
      results.push(`e2e: response validation rejects a shape the contract forbids — ${what}, but got: ${errors.join("; ")}`);
    }
    if (expected !== null && !errors.some((e) => expected.test(e))) {
      results.push(`e2e: response validation rejects a shape the contract forbids — ${what}: expected ${expected}, got [${errors.join("; ")}]`);
    }
  }
  // Arrays and $ref, the two shapes the demo contract leans on.
  const listErrors = validateAgainstSchema({ type: "array", items: { type: "string" } }, ["ok", 5]);
  if (!listErrors.some((e) => /\[1\]: expected type string/.test(e))) {
    results.push(`e2e: response validation rejects a shape the contract forbids — array items: got [${listErrors.join("; ")}]`);
  }
  const root = { components: { schemas: { Problem: { type: "object", required: ["code"] } } } };
  const refErrors = validateAgainstSchema({ $ref: "#/components/schemas/Problem" }, {}, root);
  if (!refErrors.some((e) => /required property "code"/.test(e))) {
    results.push(`e2e: response validation rejects a shape the contract forbids — $ref resolution: got [${refErrors.join("; ")}]`);
  }
}

// --- config ------------------------------------------------------------------
const withConfig = (config, extra = {}) => ({
  ".proto-forge/config.json": config,
  "docs/adr/150-flake-pilot.md": "# ADR 150: Flaky-pair pilot\n\n- Status: accepted\n",
  ...extra,
});

expect("config: the strict default passes", "config-cli.mjs", withConfig({}), { pass: true });

expect(
  "config: relaxing a mandatory gate without a waiver fails",
  "config-cli.mjs",
  withConfig({ gates: { stub: { mode: "warn" } } }),
  { pass: false, matching: /mandatory/ },
);

expect(
  "config: a complete waiver passes and is reported",
  "config-cli.mjs",
  withConfig({
    gates: { stub: { mode: "warn" } },
    waivers: [{ gate: "stub", reason: "half-ported suite for the September demo", adr: 150, expires: "2026-12-31" }],
  }),
  { pass: true, matching: /waived/i },
);

expect(
  "config: a waiver citing an ADR that does not exist fails",
  "config-cli.mjs",
  withConfig({
    gates: { stub: { mode: "warn" } },
    waivers: [{ gate: "stub", reason: "half-ported suite for the September demo", adr: 999, expires: "2026-12-31" }],
  }),
  { pass: false, matching: /does not exist/ },
);

expect(
  "config: a waiver with no real justification fails",
  "config-cli.mjs",
  withConfig({
    gates: { stub: { mode: "warn" } },
    waivers: [{ gate: "stub", reason: "later", adr: 150, expires: "2026-12-31" }],
  }),
  { pass: false, matching: /explain/ },
);

expect(
  "config: a waiver for a gate that is not relaxed fails as dead paperwork",
  "config-cli.mjs",
  withConfig({
    waivers: [{ gate: "stub", reason: "half-ported suite for the September demo", adr: 150, expires: "2026-12-31" }],
  }),
  { pass: false, matching: /stale waiver/ },
);

// An expired waiver must not merely warn: the gate has to be enforcing again.
// The fixture needs a marker for stub-scan to reject; assembled in two pieces so
// this meta-file never carries the banned byte pattern itself.
const MARKER = ["TO", "DO"].join("");
const STUBBED = `// ${MARKER}: finish this\nexport const f = () => 1;\n`;
{
  const dir = project(
    withConfig(
      {
        gates: { stub: { mode: "off" } },
        waivers: [{ gate: "stub", reason: "half-ported suite for the September demo", adr: 150, expires: "2026-01-01" }],
      },
      { "src/flows/f.ts": STUBBED },
    ),
  );
  try {
    const { code, out } = run("stub-scan.mjs", dir);
    if (code === 0) results.push(`config: an expired waiver must stop disabling the gate — stub-scan passed anyway: ${out.trim()}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// A live waiver really does downgrade the same failure to a warning.
{
  const dir = project(
    withConfig(
      {
        gates: { stub: { mode: "warn" } },
        waivers: [{ gate: "stub", reason: "half-ported suite for the September demo", adr: 150, expires: "2026-12-31" }],
      },
      { "src/flows/f.ts": STUBBED },
    ),
  );
  try {
    const { code, out } = run("stub-scan.mjs", dir);
    if (code !== 0) results.push(`config: a live waiver should downgrade stub-scan to a warning — it still failed: ${out.trim()}`);
    else if (!/WARNED/.test(out)) results.push(`config: a waived gate must still say so out loud — got: ${out.trim()}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// --- stub:scan ---------------------------------------------------------------
expect("stub: clean production code passes", "stub-scan.mjs", {
  "src/flows/f.ts": "export const f = () => 1;\n",
  ".proto-forge/config.json": {},
}, { pass: true });

expect("stub: a banned marker in production code fails", "stub-scan.mjs", {
  "src/flows/f.ts": STUBBED,
  ".proto-forge/config.json": {},
}, { pass: false, matching: /banned marker/ });

expect("stub: 'not implemented' in production code fails", "stub-scan.mjs", {
  "src/flows/f.ts": 'export const f = () => {\n  throw new Error("not implemented");\n};\n',
  ".proto-forge/config.json": {},
}, { pass: false, matching: /banned marker/ });

expect("stub: mocking a first-party module fails", "stub-scan.mjs", {
  "e2e/f.spec.ts": 'vi.mock("../src/contract/validate.js");\n',
  ".proto-forge/config.json": {},
}, { pass: false, matching: /first-party/ });

expect("stub: disabling a gated lint rule inline fails", "stub-scan.mjs", {
  "src/flows/f.ts": "// eslint-disable-next-line no-console\nexport const f = () => 1;\n",
  ".proto-forge/config.json": {},
}, { pass: false, matching: /no escape hatch/ });

expect("stub: a disable for an ungated rule is not this gate's business", "stub-scan.mjs", {
  "src/flows/f.ts": "// eslint-disable-next-line max-params\nexport const f = () => 1;\n",
  ".proto-forge/config.json": {},
}, { pass: true });

// --- guardrail hooks ------------------------------------------------------------
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
  { tool_name: "Edit", tool_input: { file_path: "scripts/validate-lib.mjs", new_string: "x" } },
  { "scripts/validate-lib.mjs": "export const x = 1;", ".proto-forge/config.json": {} },
  { blocked: true, matching: /byte-pinned/ },
);

hook(
  "hook: an ordinary feature edit is allowed",
  "guard-write.mjs",
  { tool_name: "Edit", tool_input: { file_path: "src/flows/cases.ts", new_string: "x" } },
  { "src/flows/cases.ts": "export const flowCases = [];", ".proto-forge/config.json": {} },
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

hook(
  "hook: --no-verify is blocked",
  "guard-bash.mjs",
  { tool_name: "Bash", tool_input: { command: "git commit -m x --no-verify" } },
  { ".proto-forge/config.json": {} },
  { blocked: true, matching: /skips the commit-msg/ },
);

hook(
  "hook: an ordinary command is allowed",
  "guard-bash.mjs",
  { tool_name: "Bash", tool_input: { command: "pnpm verify" } },
  { ".proto-forge/config.json": {} },
  { blocked: false },
);

hook(
  "hook: curl is blocked while the network guardrail is closed",
  "guard-bash.mjs",
  { tool_name: "Bash", tool_input: { command: "curl https://api.internal.example.com/notes" } },
  { ".proto-forge/config.json": {} },
  { blocked: true, matching: /network access is disabled/ },
);

hook(
  "hook: a host outside the allowlist is blocked even when the network is open",
  "guard-bash.mjs",
  { tool_name: "Bash", tool_input: { command: "curl https://evil.example.com/x" } },
  { ".proto-forge/config.json": { guardrails: { network: { allow: true, allowedHosts: ["localhost"] } } } },
  { blocked: true, matching: /allowedHosts/ },
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

expect("prompt: an empty log fails", "prompt-log-lint.mjs", {
  "src/a.ts": "export const a = 1;\n",
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
// tree: the gate corpus (scripts/**), validator included.
const snapshotBase = (over = {}) => ({
  "package.json": { version: "0.1.0", scripts: { verify: "pnpm run lint && pnpm run registry:verify" } },
  "scripts/keep.mjs": "export const keep = true;\n",
  "src/flows/cases.ts": "export const flowCases = [];\n",
  "docs/adr/001-base.md": "# ADR 001: Base decision\n\n- Status: accepted\n",
  // The generated locks live here, and neither --write-seed nor --write creates
  // the directory: a suite always has it, because the template ships it.
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
    writeFileSync(join(dir, "src", "flows", "unexpected.ts"), "export const x = 1;\n");
  },
});

expect("snapshot: a gate removed from verify after the baseline fails", "snapshot-diff.mjs", snapshotBase(), {
  pass: false,
  matching: /gates drifted/,
  prepare: (dir) => {
    writeBaseline(dir);
    writeFileSync(
      join(dir, "package.json"),
      JSON.stringify({ version: "0.1.0", scripts: { verify: "pnpm run lint" } }, null, 2),
    );
  },
});

// --- status: the documented numbers are the derived numbers ---------------------
// BR-36 (trimmed to this template's static facts). quality:report derives the
// registry case counts and the verify chain into quality.json and regenerates
// the STATUS.md block; status:verify re-derives both and holds the mirrors to
// their sources. The fixtures build a minimal registry pair, run the producer,
// then break exactly one copy. (No threshold mirror here: this chain enforces
// no numeric floor — that pinned case lives in the app templates.)
const STATUS_FLOWS =
  'export type FlowCase = { id: string };\nexport const flowCases = [\n  { id: "notes-roundtrip" },\n  { id: "empty-state" },\n] as const;\n';
const STATUS_CONTRACT =
  'export type ContractCase = { id: string };\nexport const contractCases = [\n  { id: "list-notes", operationId: "listNotes", expectation: { status: 200 } },\n] as const;\n';
const statusProject = (over = {}) => ({
  ".proto-forge/config.json": {},
  "package.json": { scripts: { verify: "pnpm run registry:verify && pnpm run status:verify" } },
  "src/flows/cases.ts": STATUS_FLOWS,
  "src/contract/cases.ts": STATUS_CONTRACT,
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
    writeFileSync(doc, readFileSync(doc, "utf8").replace("| flow cases | 2 |", "| flow cases | 99 |"));
  },
});

expect("status: a gate chain mirror disagreeing with package.json fails", "status-verify.mjs", statusProject(), {
  pass: false,
  matching: /gates\.chain/,
  prepare: (dir) => {
    writeQuality(dir);
    writeFileSync(join(dir, "package.json"), JSON.stringify({ scripts: { verify: "pnpm run registry:verify" } }, null, 2));
  },
});

expect("status: a missing quality.json fails", "status-verify.mjs", statusProject(), {
  pass: false,
  matching: /quality\.json is missing/,
});

// --- doctor ------------------------------------------------------------------
// NFR-18 (trimmed). The doctor is a support tool, so the contract under test is
// the useful half: a clean fixture tree passes anywhere — the engines fixture
// matches the running node, and the fixture declares no @playwright/test, so
// the browser probe stays out of scope.
expect(
  "doctor: a clean tree passes",
  "doctor.mjs",
  { "package.json": { engines: { node: `>=${process.versions.node.split(".")[0]}` } } },
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
ok("gates:selftest: every gate, guardrail and validator rejects what it claims to reject");

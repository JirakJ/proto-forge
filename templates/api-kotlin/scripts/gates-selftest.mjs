import { cpSync, existsSync, mkdtempSync, mkdirSync, readFileSync, utimesSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { execSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { fail, ok, hashTree } from "./lib.mjs";
import { FAST_GATES } from "./config.mjs";

// @adr 009 - the gates are the product, so the gates get tested
// A gate nobody has seen fail is a gate nobody knows works. This builds a throwaway
// project per case, breaks exactly one thing, and asserts the gate's exit code.
// Run it after touching any scan script: `pnpm gates:selftest`.
//
// Tier 1 (this file): fixture directories, seconds, no JVM — the case-name set is
// byte-identical to api-node's and api-java's (§18 structural symmetry; citations
// proves it). Tier 2 (`pnpm gates:selftest:native`, CI): throwaway Gradle projects
// proving the NATIVE halves fire — ArchUnit, the JaCoCo rule, flyway validate.

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
const results = [];
// Marks an inline-block proof for the citations case registry (no spawned fixture).
const inlineCase = (name) => name;

function project(files) {
  const dir = mkdtempSync(join(tmpdir(), "proto-forge-gate-"));
  for (const [path, body] of Object.entries(files)) {
    // An undefined body REMOVES a file a base fixture provided — the way a case says
    // "like the passing project, but without its docs page".
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
 * gate itself can compute (snapshot:diff, migration:verify, docs:examples) use it
 * to write the baseline the way an operator would.
 * `env` overrides the child environment — sec:scan's CI hard-stop is only
 * observable with an empty PATH, and the emitter/capture seams are env vars.
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

// --- config ------------------------------------------------------------------
const withConfig = (config, extra = {}) => ({
  ".proto-forge/config.json": config,
  "docs/adr/150-logging-pilot.md": "# ADR 150: Logging pilot\n\n- Status: accepted\n",
  ...extra,
});

expect("config: the strict default passes", "config-cli.mjs", withConfig({}), { pass: true });

expect(
  "config: relaxing a mandatory gate without a waiver fails",
  "config-cli.mjs",
  withConfig({ gates: { log: { mode: "warn" } } }),
  { pass: false, matching: /mandatory/ },
);

expect(
  "config: a complete waiver passes and is reported",
  "config-cli.mjs",
  withConfig({
    gates: { log: { mode: "warn" } },
    waivers: [{ gate: "log", reason: "noisy-logger pilot for the September demo", adr: 150, expires: "2026-12-31" }],
  }),
  { pass: true, matching: /waived/i },
);

expect(
  "config: a waiver citing an ADR that does not exist fails",
  "config-cli.mjs",
  withConfig({
    gates: { log: { mode: "warn" } },
    waivers: [{ gate: "log", reason: "noisy-logger pilot for the September demo", adr: 999, expires: "2026-12-31" }],
  }),
  { pass: false, matching: /does not exist/ },
);

expect(
  "config: a waiver with no real justification fails",
  "config-cli.mjs",
  withConfig({
    gates: { log: { mode: "warn" } },
    waivers: [{ gate: "log", reason: "later", adr: 150, expires: "2026-12-31" }],
  }),
  { pass: false, matching: /explain/ },
);

expect(
  "config: a waiver for a gate that is not relaxed fails as dead paperwork",
  "config-cli.mjs",
  withConfig({
    waivers: [{ gate: "log", reason: "noisy-logger pilot for the September demo", adr: 150, expires: "2026-12-31" }],
  }),
  { pass: false, matching: /stale waiver/ },
);

// BR-45: the fast lane is a pinned subset of verify — the runner invocation
// passes, an inlined or narrowed chain fails, and a fast gate the full chain no
// longer runs fails too.
const fastChain = FAST_GATES.map((g) => `pnpm run ${g}`).join(" && ");
const laneScripts = (over = {}) => ({
  "package.json": {
    scripts: {
      verify: `${fastChain} && pnpm run test:mutation`,
      "verify:fast": "node scripts/verify-fast.mjs",
      ...over,
    },
  },
});

expect(
  "config: a verify:fast chain matching the pinned fast set passes",
  "config-cli.mjs",
  withConfig({}, laneScripts()),
  { pass: true },
);

expect(
  "config: a verify:fast chain that drops a pinned fast gate fails",
  "config-cli.mjs",
  withConfig({}, laneScripts({ "verify:fast": fastChain.replace(" && pnpm run test:unit", "") })),
  { pass: false, matching: /drifts from the pinned fast chain/ },
);

expect(
  "config: a fast gate missing from the full verify chain fails",
  "config-cli.mjs",
  withConfig({}, laneScripts({ verify: fastChain.replace(" && pnpm run test:unit", "") })),
  { pass: false, matching: /missing from the full verify chain/ },
);

// An expired waiver must not merely warn: the gate has to be enforcing again.
// The fixture needs a bare console call for log:scan to reject; assembled in two
// pieces so this meta-file never carries the debug-call byte pattern itself.
const CONSOLE_CALL = ["print", "ln("].join("");
const NOISY = `package app.application\n\nclass F {\n    fun f() {\n        ${CONSOLE_CALL}"boom")\n    }\n}\n`;
{
  const dir = project(
    withConfig(
      {
        gates: { log: { mode: "off" } },
        waivers: [{ gate: "log", reason: "noisy-logger pilot for the September demo", adr: 150, expires: "2026-01-01" }],
      },
      { "src/main/kotlin/app/application/F.kt": NOISY },
    ),
  );
  try {
    const { code, out } = run("log-scan.mjs", dir);
    if (code === 0) results.push(`config: an expired waiver must stop disabling the gate — log:scan passed anyway: ${out.trim()}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// A live waiver really does downgrade the same failure to a warning.
{
  const dir = project(
    withConfig(
      {
        gates: { log: { mode: "warn" } },
        waivers: [{ gate: "log", reason: "noisy-logger pilot for the September demo", adr: 150, expires: "2026-12-31" }],
      },
      { "src/main/kotlin/app/application/F.kt": NOISY },
    ),
  );
  try {
    const { code, out } = run("log-scan.mjs", dir);
    if (code !== 0) results.push(`config: a live waiver should downgrade log:scan to a warning — it still failed: ${out.trim()}`);
    else if (!/WARNED/.test(out)) results.push(`config: a waived gate must still say so out loud — got: ${out.trim()}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// --- integrations ------------------------------------------------------------
// The important property is the boring one: with the defaults, nothing is sent
// and nothing is even staged.
for (const [name, script] of [
  ["jira", "sync-jira.mjs"],
  ["confluence", "sync-confluence.mjs"],
]) {
  expect(`${name}: disabled by default, stages nothing`, script, withConfig({}), {
    pass: true,
    matching: /disabled/,
  });

  // Enabled but still in dry-run: payloads land in the outbox, nothing is sent.
  const dir = project(
    withConfig({
      integrations: { [name]: { enabled: true, dryRun: true, baseUrl: "https://acme.atlassian.net", projectKey: "PF", spaceKey: "PF" } },
    }),
  );
  try {
    const { code, out } = run(script, dir);
    if (code !== 0) results.push(`${name}: dry-run should succeed without contacting anything — ${out.trim()}`);
    if (/--commit/.test(out) === false && /nothing to (file|publish)/.test(out) === false) {
      results.push(`${name}: dry-run must say how to proceed, or that there is nothing to do — got ${out.trim()}`);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// --commit with the network guardrail still closed must refuse.
expect(
  "integrations: --commit is refused while the network guardrail is closed",
  "sync-jira.mjs",
  withConfig(
    {
      integrations: { jira: { enabled: true, dryRun: false, baseUrl: "https://acme.atlassian.net", projectKey: "PF", createFor: ["adr"] } },
      guardrails: { network: { allow: false } },
    },
    { "docs/adr/010-thing.md": "# ADR 010: Thing\n\n- Status: accepted\n" },
  ),
  { pass: false, matching: /network access is disabled/, args: ["--commit", "--approve"] },
);

// autoPropagate is standing consent for exactly one thing: the per-run --approve.
// The credential check sits AFTER the approval check, so "fails asking for the
// token" proves the approval was satisfied — without contacting anything.
const autoPropagateConfig = (over = {}) =>
  withConfig({
    integrations: {
      jira: {
        enabled: true,
        dryRun: false,
        autoPropagate: true,
        baseUrl: "https://acme.atlassian.net",
        projectKey: "PF",
        createFor: ["adr"],
        ...over,
      },
    },
    guardrails: { network: { allow: true, allowedHosts: ["acme.atlassian.net"] } },
  });

expect(
  "integrations: autoPropagate stands in for --approve",
  "sync-jira.mjs",
  autoPropagateConfig(),
  { pass: false, matching: /JIRA_API_TOKEN is not set/, args: ["--commit"], env: { JIRA_API_TOKEN: "", JIRA_USER_EMAIL: "" } },
);

expect(
  "integrations: without autoPropagate the same --commit still demands --approve",
  "sync-jira.mjs",
  autoPropagateConfig({ autoPropagate: false }),
  { pass: false, matching: /requires explicit approval/, args: ["--commit"], env: { JIRA_API_TOKEN: "", JIRA_USER_EMAIL: "" } },
);

expect(
  "integrations: autoPropagate does not bypass dry-run",
  "sync-jira.mjs",
  autoPropagateConfig({ dryRun: true }),
  { pass: false, matching: /dry-run/, args: ["--commit"] },
);

expect(
  "integrations: autoPropagate does not open the network guardrail",
  "sync-jira.mjs",
  withConfig({
    integrations: {
      jira: { enabled: true, dryRun: false, autoPropagate: true, baseUrl: "https://acme.atlassian.net", projectKey: "PF", createFor: ["adr"] },
    },
    guardrails: { network: { allow: false } },
  }),
  { pass: false, matching: /network access is disabled/, args: ["--commit"] },
);

// --- guardrail hooks ----------------------------------------------------------
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

const seedFile = "src/main/kotlin/app/platform/Kernel.kt";

hook(
  "hook: editing the byte-pinned seed is blocked",
  "guard-write.mjs",
  { tool_name: "Edit", tool_input: { file_path: seedFile, new_string: "x" } },
  { [seedFile]: "package app.platform\n\nclass Kernel\n", ".proto-forge/config.json": {} },
  { blocked: true, matching: /byte-pinned/ },
);

hook(
  "hook: an ordinary feature edit is allowed",
  "guard-write.mjs",
  { tool_name: "Edit", tool_input: { file_path: "src/main/kotlin/app/application/Notes.kt", new_string: "x" } },
  { "src/main/kotlin/app/application/Notes.kt": "package app.application\n\nclass Notes\n", ".proto-forge/config.json": {} },
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
  "hook: editing the model registry copy is blocked",
  "guard-write.mjs",
  { tool_name: "Edit", tool_input: { file_path: ".proto-forge/models.json", new_string: "x" } },
  { ".proto-forge/models.json": "{}", ".proto-forge/config.json": {} },
  { blocked: true, matching: /protected pattern/ },
);

hook(
  "hook: a session start reporting a model records it",
  "record-model.mjs",
  { hook_event_name: "SessionStart", model: "frontier-x" },
  { ".proto-forge/config.json": {} },
  { blocked: false, matching: /recorded frontier-x/ },
);

hook(
  "hook: a model switch replaces the session record",
  "record-model.mjs",
  { hook_event_name: "PostModelSwitch", from_model: "frontier-x", to_model: "standard-x" },
  { ".proto-forge/config.json": {}, ".proto-forge/session.json": '{"model":"frontier-x"}' },
  { blocked: false, matching: /recorded standard-x/ },
);

hook(
  "hook: adding a NEW prompt-log entry is allowed",
  "guard-write.mjs",
  { tool_name: "Write", tool_input: { file_path: ".prompts/0003-fix.md", content: "# fix" } },
  { ".proto-forge/config.json": {} },
  { blocked: false },
);

hook(
  "hook: lowering a coverage threshold is blocked",
  "guard-write.mjs",
  { tool_name: "Edit", tool_input: { file_path: "build.gradle.kts", new_string: 'minimum = "0.40".toBigDecimal()' } },
  { "build.gradle.kts": "plugins { kotlin(\"jvm\") }\n", ".proto-forge/config.json": {} },
  { blocked: true, matching: /coverage threshold/ },
);

hook(
  "hook: switching a gate to warn in the config is blocked",
  "guard-write.mjs",
  { tool_name: "Edit", tool_input: { file_path: ".proto-forge/config.json", new_string: '"mode": "warn"' } },
  { ".proto-forge/config.json": {} },
  { blocked: true, matching: /gate mode/ },
);

hook(
  "hook: lowering the mutation-score floor is blocked",
  "guard-write.mjs",
  { tool_name: "Edit", tool_input: { file_path: "build.gradle.kts", new_string: "mutationThreshold = 40" } },
  { ".proto-forge/config.json": {} },
  { blocked: true, matching: /mutation-score floor/ },
);

hook(
  "hook: narrowing the mutation scope is blocked",
  "guard-write.mjs",
  { tool_name: "Write", tool_input: { file_path: "build.gradle.kts", content: 'pitest { targetClasses = setOf("app.one") }' } },
  { ".proto-forge/config.json": {} },
  { blocked: true, matching: /mutation scope/ },
);

hook(
  "hook: raising the duplication threshold is blocked",
  "guard-write.mjs",
  { tool_name: "Edit", tool_input: { file_path: ".jscpd.json", new_string: '"threshold": 3,' } },
  { ".proto-forge/config.json": {} },
  { blocked: true, matching: /duplication threshold/ },
);

hook(
  "hook: widening the duplication ignore list is blocked",
  "guard-write.mjs",
  { tool_name: "Edit", tool_input: { file_path: ".jscpd.json", new_string: '"ignore": ["src/**"]' } },
  { ".proto-forge/config.json": {} },
  { blocked: true, matching: /duplication ignore/ },
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
  { tool_name: "Bash", tool_input: { command: "curl https://acme.atlassian.net/rest/api/2/issue" } },
  { ".proto-forge/config.json": {} },
  { blocked: true, matching: /network access is disabled/ },
);

hook(
  "hook: a host outside the allowlist is blocked even when the network is open",
  "guard-bash.mjs",
  { tool_name: "Bash", tool_input: { command: "curl https://evil.example.com/x" } },
  { ".proto-forge/config.json": { guardrails: { network: { allow: true, allowedHosts: ["acme.atlassian.net"] } } } },
  { blocked: true, matching: /allowedHosts/ },
);

// --- markdown → Confluence storage --------------------------------------------
{
  const { mdToStorage } = await import("./md-to-storage.mjs");
  const { storage, attachments } = mdToStorage(
    [
      "<!-- no-example: nothing to show -->",
      "# Title",
      "",
      "Text with `code`, **bold** and a [link](https://example.com).",
      "",
      "![A shot](open.png)",
      "",
      "| A | B |",
      "| --- | --- |",
      "| 1 | 2 |",
      "",
      "- one",
      "- two",
      "",
      "```kotlin",
      "val x = if (1 < 2) 1 else 2",
      "```",
    ].join("\n"),
  );
  const must = [
    ["<h1>Title</h1>", "heading"],
    ["<code>code</code>", "inline code"],
    ["<strong>bold</strong>", "bold"],
    ['<a href="https://example.com">link</a>', "link"],
    ['<ri:attachment ri:filename="open.png" />', "image as attachment"],
    ["<table><tbody><tr><th>A</th>", "table"],
    ["<ul><li>one</li><li>two</li></ul>", "list"],
    ["<![CDATA[val x = if (1 < 2) 1 else 2]]>", "code block, unescaped inside CDATA"],
  ];
  for (const [needle, what] of must) {
    if (!storage.includes(needle)) results.push(`md-to-storage: ${what} missing — expected ${needle}`);
  }
  if (storage.includes("no-example")) results.push("md-to-storage: HTML comments must not reach the page");
  if (!attachments.includes("open.png")) results.push("md-to-storage: image was not reported as an attachment");
}

// --- ignore-registry ---------------------------------------------------------------
// The jacoco-ignore population is currently ZERO; this gate keeps it from eroding one
// "harmless" ignore at a time. An ignore must state a reason, name the harness case
// that covers the branch in the e2e conformance run, and change the pinned count in
// the snapshot -- a reviewed diff, never a drive-by.
const CASES_KOTLIN =
  "package app.harness\n\nobject HarnessCases {\n    val CASES: List<HarnessCase> = listOf(\n" +
  '        HarnessCase(\n            "note-get-missing",\n            "note-get", "problem", "x", "GET", "/x", null, 404, "note-not-found"),\n    )\n}\n';
const kotlinSource = (body) => `package app.application\n\nclass F {\n${body}    fun f(): Int {\n        return 1\n    }\n}\n`;
const ignoreProject = (source, pinned) => ({
  "src/test/kotlin/app/harness/Cases.kt": CASES_KOTLIN,
  "src/main/kotlin/app/application/F.kt": source,
  ".proto-forge/snapshot.json": { ignores: pinned },
});

expect("ignores: a clean tree with a matching pin passes", "ignore-registry.mjs",
  ignoreProject(kotlinSource(""), 0), { pass: true });

expect("ignores: a well-formed, evidenced ignore with a matching pin passes", "ignore-registry.mjs",
  ignoreProject(
    kotlinSource("    // jacoco ignore next -- the pool error path needs a real broken socket [covered-by: note-get-missing]\n"),
    1,
  ), { pass: true });

expect("ignores: a bare ignore with no reason fails", "ignore-registry.mjs",
  ignoreProject(kotlinSource("    // jacoco ignore next\n"), 1),
  { pass: false, matching: /covered-by/ });

expect("ignores: a reasoned ignore naming no browser evidence fails", "ignore-registry.mjs",
  ignoreProject(kotlinSource("    // jacoco ignore next -- unit tests cannot reach this branch at all\n"), 1),
  { pass: false, matching: /covered-by/ });

expect("ignores: evidence that does not exist is not evidence", "ignore-registry.mjs",
  ignoreProject(
    kotlinSource("    // jacoco ignore next -- the pool error path needs a real broken socket [covered-by: invented-case]\n"),
    1,
  ), { pass: false, matching: /does not declare/ });

expect("ignores: a population that grew past its pin fails", "ignore-registry.mjs",
  ignoreProject(
    kotlinSource("    // jacoco ignore next -- the pool error path needs a real broken socket [covered-by: note-get-missing]\n"),
    0,
  ), { pass: false, matching: /pins 0/ });

// --- external:verify ---------------------------------------------------------------
// A record in docs/external/** is provenance for a remote object. Every field the
// claim needs is required, and the emptiest one is the reason the gate exists:
// affectedFiles=[] asserts "this object concerns nothing here".
const RECORD = (over = "") => `---
source: "confluence"
id: "123"
url: "https://acme.atlassian.net/wiki/pages/123"
title: "Architecture"
remoteVersion: 4
remoteUpdatedAt: "2026-08-12T10:00:00Z"
syncedAt: "2026-08-12T10:05:00Z"
direction: "push"
affectedFiles:
  - "docs/ARCHITECTURE.md"
${over}---

Pushed from this repository.
`;
const externalProject = (record, over = {}) => ({
  "docs/external/confluence/architecture.mdx": record,
  "docs/ARCHITECTURE.md": "# Architecture\n",
  ...over,
});

expect("external: a complete record passes", "external-verify.mjs", externalProject(RECORD()), { pass: true });

expect("external: a record with no url fails", "external-verify.mjs",
  externalProject(RECORD().replace('url: "https://acme.atlassian.net/wiki/pages/123"\n', "")),
  { pass: false, matching: /missing required frontmatter "url"/ });

expect("external: a url on the wrong host fails when the integration is configured", "external-verify.mjs",
  externalProject(RECORD().replace("acme.atlassian.net", "evil.example.com"), {
    ".proto-forge/config.json": {
      integrations: { confluence: { enabled: false, baseUrl: "https://acme.atlassian.net" } },
    },
  }),
  { pass: false, matching: /not the configured confluence host/ });

expect("external: a non-ISO remoteUpdatedAt fails", "external-verify.mjs",
  externalProject(RECORD().replace('remoteUpdatedAt: "2026-08-12T10:00:00Z"', 'remoteUpdatedAt: "yesterday"')),
  { pass: false, matching: /not an ISO-8601 instant/ });

expect("external: an affected file that does not exist fails", "external-verify.mjs",
  externalProject(RECORD().replace('"docs/ARCHITECTURE.md"', '"docs/GONE.md"')),
  { pass: false, matching: /does not exist/ });

expect("external: an empty affectedFiles fails — it asserts the object concerns nothing", "external-verify.mjs",
  externalProject(RECORD().replace('affectedFiles:\n  - "docs/ARCHITECTURE.md"\n', "affectedFiles: []\n")),
  { pass: false, matching: /affects nothing/ });

expect("external: a Confluence record without a remoteVersion fails", "external-verify.mjs",
  externalProject(RECORD().replace("remoteVersion: 4\n", "")),
  { pass: false, matching: /remoteVersion is required/ });

// --- coverage:policy -------------------------------------------------------------
// The floors are only meaningful while nobody lowers a JaCoCo minimum and nobody
// adds an exclusion. A hook blocks both locally; this gate is the same promise in CI.
const BUILD_GRADLE = (rules, exclude) => `plugins { kotlin("jvm") }
tasks.jacocoTestCoverageVerification {
    violationRules {
${rules}
    }
    classDirectories.setFrom(
        sourceSets.main.get().output.asFileTree.matching {
            exclude(
${exclude}
            )
        }
    )
}
`;
const RULE = (minimum) => `        rule {
            element = "PACKAGE"
            includes = listOf(
                "app.domain", "app.domain.*",
                "app.application", "app.application.*",
                "app.config", "app.config.*",
            )
            limit { counter = "INSTRUCTION"; value = "COVEREDRATIO"; minimum = "${minimum}".toBigDecimal() }
            limit { counter = "BRANCH"; value = "COVEREDRATIO"; minimum = "1.00".toBigDecimal() }
            limit { counter = "LINE"; value = "COVEREDRATIO"; minimum = "1.00".toBigDecimal() }
        }`;
const GOOD_RULES = RULE("1.00");
const GOOD_EXCLUDE = '                // bootstrap entry: the composition root opens the socket, covered by the conformance run\n                "app/MainKt*",';

expect("coverage: floors at 100 and reasoned exclusions pass", "coverage-policy.mjs", {
  "build.gradle.kts": BUILD_GRADLE(GOOD_RULES, GOOD_EXCLUDE),
}, { pass: true });

expect("coverage: a lowered threshold fails", "coverage-policy.mjs", {
  "build.gradle.kts": BUILD_GRADLE(RULE("0.85"), GOOD_EXCLUDE),
}, { pass: false, matching: /minimum is 0\.85/ });

expect("coverage: an exclusion outside the allow-list fails", "coverage-policy.mjs", {
  "build.gradle.kts": BUILD_GRADLE(GOOD_RULES, GOOD_EXCLUDE + '\n                // convenient\n                "app/application/**",'),
}, { pass: false, matching: /not on the allow-list/ });

expect("coverage: an allow-listed exclusion without its reason fails", "coverage-policy.mjs", {
  "build.gradle.kts": BUILD_GRADLE(GOOD_RULES, '                "app/MainKt*",'),
}, { pass: false, matching: /no reason comment/ });

// The tamper-guard must not be blinded by the tamper it guards against: the block
// scan is anchored on the closing parenthesis ON ITS OWN LINE, so an entry carrying
// a character class (or any bracket noise) cannot truncate the scan and smuggle the
// entries after it past the allow-list.
expect("coverage: a character-class glob cannot truncate the exclude scan", "coverage-policy.mjs", {
  "build.gradle.kts": BUILD_GRADLE(GOOD_RULES, GOOD_EXCLUDE + '\n                // convenient\n                "app/[a-z]*/**",'),
}, { pass: false, matching: /"app\/\[a-z\]\*\/\*\*" is not on the allow-list/ });

// --- sec:conformance (BR-39) --------------------------------------------------
// The claim has to be DERIVED, not written: a conformance report nobody re-derives
// stays green while becoming false. These pin the three ways that breaks — a probe
// that stops holding, a committed claim that no longer matches the tree, and no
// claim at all — plus the property the whole thing rests on: byte-reproducibility.
const CONF_STANDARD = JSON.stringify({
  requirements: [{ chapter_id: "V3", req_id: "V3.4.4", req_description: "nosniff", L: "2" }],
});
const CONF_CATALOGUE = {
  standards: {
    asvs: {
      name: "OWASP ASVS",
      version: "5.0.0",
      vendored: "references/standards/asvs.flat.json",
      sha256: "unused-by-the-template",
      profile: { default: 2 },
    },
  },
  controls: [
    {
      id: "SEC-003",
      title: "Responses forbid MIME sniffing",
      requires: [{ standard: "asvs", req: "V3.4.4" }],
      appliesTo: { kinds: ["backend"] },
      control: "X-Content-Type-Options: nosniff",
      status: "enforced",
      probe: "headerNosniff",
    },
  ],
};
const NGINX_OK = "unused-by-this-kind\n";
const VITE_OK = 'reply.header("x-content-type-options", "nosniff");\n';
const confBase = (over = {}) => ({
  ".proto-forge/security/controls.json": CONF_CATALOGUE,
  ".proto-forge/standards/asvs.flat.json": CONF_STANDARD,
  // this kind has no second runtime file
  "src/main/kotlin/app/platform/SecurityHeaders.kt": VITE_OK,
  ...over,
});
const writeClaim = (dir) => run("sec-conformance.mjs", dir, ["--write"]);

expect("conformance: a derived claim that matches the tree passes", "sec-conformance.mjs", confBase(), {
  pass: true,
  prepare: writeClaim,
});

expect("conformance: no committed claim at all fails", "sec-conformance.mjs", confBase(), {
  pass: false,
  matching: /is missing/,
});

expect("conformance: a claim that no longer matches the tree fails", "sec-conformance.mjs", confBase(), {
  pass: false,
  matching: /have\s+diverged|diverged/,
  prepare: (dir) => {
    writeClaim(dir);
    // The header goes away AFTER the claim was written: the committed claim still
    // says the control is met, and the tree no longer backs that.
    writeFileSync(join(dir, "src/main/kotlin/app/platform/SecurityHeaders.kt"), "// nothing\\n");
  },
});

expect("conformance: a control whose probe stops holding fails", "sec-conformance.mjs", confBase({
  "src/main/kotlin/app/platform/SecurityHeaders.kt": "// nothing\\n",
}), { pass: false, matching: /does not hold/, prepare: (dir) => run("sec-conformance.mjs", dir, ["--write"]) });

expect("conformance: a catalogue naming a probe this template lacks fails", "sec-conformance.mjs", confBase({
  ".proto-forge/security/controls.json": {
    ...CONF_CATALOGUE,
    controls: [{ ...CONF_CATALOGUE.controls[0], probe: "quantumEntanglementCheck" }],
  },
}), { pass: false, matching: /does not implement/ });

expect("conformance: no catalogue at all fails", "sec-conformance.mjs", { "src/main/kotlin/app/platform/SecurityHeaders.kt": VITE_OK }, {
  pass: false,
  matching: /no catalogue to measure against/,
});

// SEC-041 (SSDF RV.1.3): the disclosure policy is a probed control — a section
// that names a channel and a response window holds, a page without one does not.
const DISCLOSURE_CONTROL = {
  id: "SEC-041",
  title: "There is a way to report a vulnerability, and it names a deadline",
  requires: [],
  appliesTo: { kinds: ["frontend", "backend", "desktop"] },
  control: "a disclosure section in docs/SECURITY.md naming a channel and a response window",
  status: "enforced",
  probe: "disclosurePolicyStated",
};
const withDisclosure = (over = {}) => confBase({
  ".proto-forge/security/controls.json": { ...CONF_CATALOGUE, controls: [...CONF_CATALOGUE.controls, DISCLOSURE_CONTROL] },
  "docs/SECURITY.md":
    "# Security\n\n## Reporting a vulnerability\n\nReport privately at https://example.test/security. Acknowledgement within 3 business days.\n",
  ...over,
});

expect("conformance: a disclosure section naming a channel and a window passes", "sec-conformance.mjs", withDisclosure(), {
  pass: true,
  prepare: writeClaim,
});

expect("conformance: a security page with no disclosure section fails", "sec-conformance.mjs", withDisclosure({
  "docs/SECURITY.md": "# Security\n\n## Headers\n\nnosniff.\n",
}), { pass: false, matching: /SEC-041 .* does not hold/, prepare: writeClaim });

expect("conformance: a disclosure section with no response window fails", "sec-conformance.mjs", withDisclosure({
  "docs/SECURITY.md": "# Security\n\n## Reporting a vulnerability\n\nReport privately at https://example.test/security.\n",
}), { pass: false, matching: /SEC-041 .* does not hold/, prepare: writeClaim });

// --- stub:scan ---------------------------------------------------------------
expect("stub: clean production code passes", "stub-scan.mjs", {
  "src/main/kotlin/app/application/F.kt": kotlinSource(""),
}, { pass: true });

expect("stub: a banned marker in production code fails", "stub-scan.mjs", {
  "src/main/kotlin/app/application/F.kt": "// TODO: finish this\n" + kotlinSource(""),
}, { pass: false, matching: /banned marker/ });

expect("stub: 'not implemented' in production code fails", "stub-scan.mjs", {
  "src/main/kotlin/app/application/F.kt":
    'package app.application\n\nclass F {\n    fun f(): Int {\n        throw UnsupportedOperationException("not implemented")\n    }\n}\n',
}, { pass: false, matching: /banned marker/ });

expect("stub: mocking a first-party module fails", "stub-scan.mjs", {
  "src/test/kotlin/app/application/FTest.kt":
    "package app.application\n\nimport io.mockk.mockk\n\nclass FTest {\n    val repo = mockk<app.domain.note.NoteRepository>()\n}\n",
}, { pass: false, matching: /first-party/ });

expect("stub: pulling __fixtures__ into production code fails", "stub-scan.mjs", {
  "src/main/kotlin/app/application/F.kt":
    "package app.application\n\nimport app.fixtures.NoteFixtures\n\nclass F {\n    val note = NoteFixtures.NOTES()\n}\n",
}, { pass: false, matching: /__fixtures__/ });

expect("stub: a fixture built with defineFactory passes", "stub-scan.mjs", {
  "src/test/kotlin/app/fixtures/NoteFixtures.kt":
    "package app.fixtures\n\nobject NoteFixtures {\n" +
    "    val NOTES: () -> Int = Factory.defineFactory { seq -> build(seq) }\n" +
    "    fun build(seq: Int): Int = seq\n}\n",
}, { pass: true });

expect("stub: a fixture exporting a bare literal fails", "stub-scan.mjs", {
  "src/test/kotlin/app/fixtures/NoteFixtures.kt":
    'package app.fixtures\n\nobject NoteFixtures {\n    val NOTES: List<String> = listOf("hand-written")\n}\n',
}, { pass: false, matching: /defineFactory/ });

// BR-21/NFR-12 have no suppression escape hatch: a blanket @Suppress("detekt:all")
// silences the gated rules, so it is a shortcut marker, exactly like TODO.
expect("stub: disabling a gated lint rule inline fails", "stub-scan.mjs", {
  "src/main/kotlin/app/application/F.kt":
    'package app.application\n\n@Suppress("detekt:all")\nclass F {\n    fun f(): Int {\n        return 1\n    }\n}\n',
}, { pass: false, matching: /no escape hatch/ });

expect("stub: a disable for an ungated rule is not this gate's business", "stub-scan.mjs", {
  "src/main/kotlin/app/application/F.kt":
    'package app.application\n\n@Suppress("UNCHECKED_CAST")\nclass F {\n    fun f(): Int {\n        return 1\n    }\n}\n',
}, { pass: true });

// --- adr:lint ----------------------------------------------------------------
const adr = (num, status, extra = "") =>
  `# ADR ${num}: A decision\n\n- Status: ${status}\n- Date: 2026-08-12\n${extra}\n## Context\n\nx\n`;
// The smallest registry the model gates accept (BR-50 / NFR-31): one model per
// tier, an alias, and the co-author identity each signs with. Self-contained so
// the suite never reads this repository's own .proto-forge/models.json.
const MODELS = {
  tiers: { frontier: { rank: 3 }, standard: { rank: 2 }, economy: { rank: 1 } },
  models: [
    { id: "frontier-x", provider: "t", displayName: "Frontier X", aliases: ["fx"], tier: "frontier", pricing: { input: 10, output: 50, asOf: "2026-09-17" }, coAuthor: { name: "Frontier X", email: "frontier@example.test" } },
    { id: "standard-x", provider: "t", displayName: "Standard X", aliases: ["sx"], tier: "standard", pricing: { input: 2, output: 10, asOf: "2026-09-17" }, coAuthor: { name: "Standard X", email: "standard@example.test" } },
    { id: "economy-x", provider: "t", displayName: "Economy X", aliases: ["ex"], tier: "economy", pricing: { input: 1, output: 5, asOf: "2026-09-17" }, coAuthor: { name: "Economy X", email: "economy@example.test" } },
  ],
  routing: { "feature-build": "standard", translation: "economy", "brief-intake": "frontier" },
};
const promptEntry = "---\nid: 0001\ntimestamp: 2026-08-12T00:00:00Z\nphase: 1\nmodel: frontier-x\n---\n\n## Prompt\n\nx\n";
const promptFiles = (over = {}) => ({ ".proto-forge/models.json": MODELS, ...over });
const NOTE_RECORD = "// @adr 010 - the note domain\npackage app.domain.note\n\ndata class Note(val id: String)\n";

expect("adr: an anchored, accepted, prompt-linked ADR passes", "adr-lint.mjs", {
  "docs/adr/010-a-decision.md": adr("010", "accepted", "- Prompt-log: .prompts/0001-x.md\n"),
  ".prompts/0001-x.md": promptEntry,
  "src/main/kotlin/app/domain/note/Note.kt": NOTE_RECORD,
}, { pass: true });

expect("adr: an anchor to an ADR that does not exist fails", "adr-lint.mjs", {
  "src/main/kotlin/app/domain/note/Note.kt": NOTE_RECORD.replace("@adr 010", "@adr 777"),
}, { pass: false, matching: /no ADR file/ });

expect("adr: an anchor to a proposed ADR fails", "adr-lint.mjs", {
  "docs/adr/010-a-decision.md": adr("010", "proposed", "- Prompt-log: .prompts/0001-x.md\n"),
  ".prompts/0001-x.md": promptEntry,
  "src/main/kotlin/app/domain/note/Note.kt": NOTE_RECORD,
}, { pass: false, matching: /proposed ADR/ });

expect("adr: an accepted ADR nobody anchored fails", "adr-lint.mjs", {
  "docs/adr/010-a-decision.md": adr("010", "accepted", "- Prompt-log: .prompts/0001-x.md\n"),
  ".prompts/0001-x.md": promptEntry,
  "src/main/kotlin/app/domain/note/Note.kt": "package app.domain.note\n\ndata class Note(val id: String)\n",
}, { pass: false, matching: /never anchored/ });

expect("adr: an accepted ADR with no prompt-log back-reference fails", "adr-lint.mjs", {
  "docs/adr/010-a-decision.md": adr("010", "accepted"),
  "src/main/kotlin/app/domain/note/Note.kt": NOTE_RECORD,
}, { pass: false, matching: /Prompt-log/ });

expect("adr: a prompt-log reference pointing at nothing fails", "adr-lint.mjs", {
  "docs/adr/010-a-decision.md": adr("010", "accepted", "- Prompt-log: .prompts/0009-absent.md\n"),
  "src/main/kotlin/app/domain/note/Note.kt": NOTE_RECORD,
}, { pass: false, matching: /does not exist/ });

// Two files sharing a number would shadow each other in every by-number lookup, and a
// generator allocating "the low end of the band" next to a pre-written ADR is exactly
// how it happens. An error, never last-write-wins.
expect("adr: the same number on two files fails", "adr-lint.mjs", {
  "docs/adr/010-a-decision.md": adr("010", "accepted", "- Prompt-log: .prompts/0001-x.md\n"),
  "docs/adr/010-a-rival.md": adr("010", "accepted", "- Prompt-log: .prompts/0001-x.md\n"),
  ".prompts/0001-x.md": promptEntry,
  "src/main/kotlin/app/domain/note/Note.kt": NOTE_RECORD,
}, { pass: false, matching: /used twice/ });

// --- prompt:lint -------------------------------------------------------------
expect("prompt: well-formed, strictly increasing entries pass", "prompt-log-lint.mjs", promptFiles({
  ".prompts/0001-scaffold.md": promptEntry,
  ".prompts/0002-brief.md": promptEntry.replace("id: 0001", "id: 0002"),
}), { pass: true });

// BR-13: the log is English — a foreign-language prompt is recorded as its
// English rendering; product strings that must stay foreign are quoted as code.
expect("prompt: a non-English prompt body fails", "prompt-log-lint.mjs", promptFiles({
  ".prompts/0001-scaffold.md": promptEntry.replace("\nx\n", "\nPosuň výstup na produkční úroveň.\n"),
}), { pass: false, matching: /non-English prompt text/ });

expect("prompt: backtick-quoted foreign strings pass", "prompt-log-lint.mjs", promptFiles({
  ".prompts/0001-scaffold.md": promptEntry.replace(
    "\nx\n",
    "\nRename the save action to the `Uložit` label the brief demands — «redacted:pii» signed it off.\n",
  ),
}), { pass: true });

expect("prompt: an empty log fails", "prompt-log-lint.mjs", promptFiles({
  "src/main/kotlin/app/A.kt": "package app\n\nclass A\n",
}), { pass: false, matching: /no prompt-log entries/ });

expect("prompt: a filename that is not NNNN-slug.md fails", "prompt-log-lint.mjs", promptFiles({
  ".prompts/1-scaffold.md": promptEntry,
}), { pass: false, matching: /NNNN-slug/ });

expect("prompt: an id that disagrees with the filename fails", "prompt-log-lint.mjs", promptFiles({
  ".prompts/0001-scaffold.md": promptEntry.replace("id: 0001", "id: 0002"),
}), { pass: false, matching: /!=/ });

expect("prompt: an entry with no ## Prompt section fails", "prompt-log-lint.mjs", promptFiles({
  ".prompts/0001-scaffold.md": "---\nid: 0001\ntimestamp: 2026-08-12T00:00:00Z\nphase: 1\nmodel: frontier-x\n---\n\n## Outcome\n\nx\n",
}), { pass: false, matching: /## Prompt/ });

// Two entries sharing a number is the only way to reach the ordering check:
// ids are validated against the filename, and filenames sort ascending, so a
// duplicated prefix is what a botched "append" actually looks like.
expect("prompt: ids that do not strictly increase fail", "prompt-log-lint.mjs", promptFiles({
  ".prompts/0001-a.md": promptEntry,
  ".prompts/0001-b.md": promptEntry,
}), { pass: false, matching: /strictly increasing/ });

// BR-50: every entry names its model; a delegated entry sits on the routed tier,
// and a frontier orchestrator only ever delegates DOWN — no override for that.
const delegated = (id, model, activity, extra = "") =>
  `---\nid: ${id}\ntimestamp: 2026-08-12T00:00:00Z\nphase: 4\nmodel: ${model}\ndelegated-by: 0001\nactivity: ${activity}\n${extra}---\n\n## Prompt\n\nx\n`;

expect("prompt: an entry naming no model fails", "prompt-log-lint.mjs", promptFiles({
  ".prompts/0001-scaffold.md": promptEntry.replace("model: frontier-x\n", ""),
}), { pass: false, matching: /missing model/ });

expect("prompt: an unregistered model fails", "prompt-log-lint.mjs", promptFiles({
  ".prompts/0001-scaffold.md": promptEntry.replace("model: frontier-x", "model: mystery-9"),
}), { pass: false, matching: /not in the registry/ });

expect("prompt: a model named by its alias passes", "prompt-log-lint.mjs", promptFiles({
  ".prompts/0001-scaffold.md": promptEntry.replace("model: frontier-x", "model: fx"),
}), { pass: true });

expect("prompt: a delegated entry on the routed tier passes", "prompt-log-lint.mjs", promptFiles({
  ".prompts/0001-scaffold.md": promptEntry,
  ".prompts/0002-feature.md": delegated("0002", "standard-x", "feature-build"),
}), { pass: true, matching: /1 delegated/ });

expect("prompt: a delegated entry at the frontier orchestrator's own tier fails", "prompt-log-lint.mjs", promptFiles({
  ".prompts/0001-scaffold.md": promptEntry,
  ".prompts/0002-intake.md": delegated("0002", "frontier-x", "brief-intake", "routing-override: the operator insisted\n"),
}), { pass: false, matching: /strictly cheaper tier, no override/ });

expect("prompt: a delegated entry off the routed tier without an override fails", "prompt-log-lint.mjs", promptFiles({
  ".prompts/0001-scaffold.md": promptEntry,
  ".prompts/0002-translate.md": delegated("0002", "standard-x", "translation"),
}), { pass: false, matching: /routed to economy/ });

expect("prompt: a delegated entry off the routed tier with a recorded override passes", "prompt-log-lint.mjs", promptFiles({
  ".prompts/0001-scaffold.md": promptEntry,
  ".prompts/0002-translate.md": delegated("0002", "standard-x", "translation", "routing-override: plural rules in this locale defeated the economy model twice\n"),
}), { pass: true });

expect("prompt: a delegated entry naming an unrouted activity fails", "prompt-log-lint.mjs", promptFiles({
  ".prompts/0001-scaffold.md": promptEntry,
  ".prompts/0002-x.md": delegated("0002", "standard-x", "vibes"),
}), { pass: false, matching: /not a routed activity/ });

expect("prompt: a delegated entry naming a later entry as its orchestrator fails", "prompt-log-lint.mjs", promptFiles({
  ".prompts/0001-scaffold.md": promptEntry,
  ".prompts/0002-x.md": delegated("0002", "standard-x", "feature-build").replace("delegated-by: 0001", "delegated-by: 0003"),
  ".prompts/0003-y.md": promptEntry.replace("id: 0001", "id: 0003"),
}), { pass: false, matching: /not an earlier entry/ });

expect("prompt: a missing model registry fails", "prompt-log-lint.mjs", {
  ".prompts/0001-scaffold.md": promptEntry,
}, { pass: false, matching: /models.json is missing/ });

// --- commit-lint ---------------------------------------------------------------
// The message half is testable anywhere; the diff half (BR-06: one accepted ADR = one
// commit, and the diff must agree with the trailer) needs real staged changes, so
// `prepare` builds a throwaway git repository around the fixture files. HOME points
// at the fixture so an operator's ~/.gitconfig cannot change the outcome.
const stageAll = (dir) => {
  const git = (...args) => spawnSync("git", args, { cwd: dir, env: { ...process.env, HOME: dir } });
  git("init", "-q");
  git("add", "-A");
};
const MSG_OK =
  "feat: accept the note domain decision\n\nADR: 010\nPrompt-Log: .prompts/0001-x.md\n" +
  "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>\n";

expect("commit: a trailer matching the one staged acceptance passes", "commit-lint.mjs", {
  "msg.txt": MSG_OK,
  "docs/adr/010-a-decision.md": adr("010", "accepted"),
}, { pass: true, args: ["msg.txt"], prepare: stageAll });

expect("commit: a non-conventional subject fails", "commit-lint.mjs", {
  "msg.txt": "accepted some stuff\n\nADR: 010\nPrompt-Log: .prompts/0001-x.md\n",
  "docs/adr/010-a-decision.md": adr("010", "accepted"),
}, { pass: false, matching: /Conventional Commits/, args: ["msg.txt"], prepare: stageAll });

expect("commit: staging two acceptances under one trailer fails", "commit-lint.mjs", {
  "msg.txt": MSG_OK,
  "docs/adr/010-a-decision.md": adr("010", "accepted"),
  "docs/adr/011-a-rival.md": adr("011", "accepted"),
}, { pass: false, matching: /one decision, one commit/, args: ["msg.txt"], prepare: stageAll });

expect("commit: a trailer naming a different ADR than the diff accepts fails", "commit-lint.mjs", {
  "msg.txt": "feat: accept the note domain decision\n\nADR: 011\nPrompt-Log: .prompts/0001-x.md\n",
  "docs/adr/010-a-decision.md": adr("010", "accepted"),
  "docs/adr/011-a-rival.md": adr("011", "proposed"),
}, { pass: false, matching: /trailer names ADR 011 but the staged diff accepts ADR 010/, args: ["msg.txt"], prepare: stageAll });

// BR-46: the operator authors, the model co-authors — the trailer is required,
// well-formed, and never the same identity as the git author.
expect("commit: a missing model co-author trailer fails", "commit-lint.mjs", {
  "msg.txt": "feat: accept the note domain decision\n\nADR: 010\nPrompt-Log: .prompts/0001-x.md\n",
  "docs/adr/010-a-decision.md": adr("010", "accepted"),
}, { pass: false, matching: /Co-Authored-By/, args: ["msg.txt"], prepare: stageAll });

expect("commit: a malformed co-author trailer fails", "commit-lint.mjs", {
  "msg.txt": "feat: accept the note domain decision\n\nADR: 010\nPrompt-Log: .prompts/0001-x.md\nCo-Authored-By: Claude Fable 5\n",
  "docs/adr/010-a-decision.md": adr("010", "accepted"),
}, { pass: false, matching: /malformed/, args: ["msg.txt"], prepare: stageAll });

expect("commit: the model authoring its own commit fails", "commit-lint.mjs", {
  "msg.txt": MSG_OK,
  "docs/adr/010-a-decision.md": adr("010", "accepted"),
}, {
  pass: false,
  matching: /the operator authors, the model co-authors/,
  args: ["msg.txt"],
  prepare: (dir) => {
    stageAll(dir);
    const git = (...args) => spawnSync("git", args, { cwd: dir, env: { ...process.env, HOME: dir } });
    git("config", "user.name", "Claude Fable 5");
    git("config", "user.email", "noreply@anthropic.com");
  },
});

// BR-46 (amended): the trailer is DERIVED by the prepare-commit-msg half from
// the model the cited prompt-log entry records, and VERIFIED by the commit-msg
// half against the same entry — a trailer naming another model fails.
const MSG_UNSIGNED = "feat: accept the note domain decision\n\nADR: 010\nPrompt-Log: .prompts/0001-x.md\n";
const entryOn = (model) => promptEntry.replace("model: frontier-x", `model: ${model}`);
const stageWithRegistry = (dir) => stageAll(dir);

expect("commit: the co-author trailer is derived from the cited entry's model", "commit-coauthor.mjs", promptFiles({
  "msg.txt": MSG_UNSIGNED,
  ".prompts/0001-x.md": entryOn("standard-x"),
}), { pass: true, matching: /Co-Authored-By: Standard X <standard@example.test>/, args: ["msg.txt", "message"] });

expect("commit: a message already signed is left alone by the derive step", "commit-coauthor.mjs", promptFiles({
  "msg.txt": MSG_OK,
  ".prompts/0001-x.md": entryOn("standard-x"),
}), { pass: true, args: ["msg.txt", "message"] });

expect("commit: the derive step falls back to the session record", "commit-coauthor.mjs", promptFiles({
  "msg.txt": "feat: accept the note domain decision\n\nADR: 010\n",
  ".proto-forge/session.json": { model: "ex", recordedAt: "2026-09-17T00:00:00Z", event: "SessionStart" },
}), { pass: true, matching: /Economy X <economy@example.test>/, args: ["msg.txt", "message"] });

expect("commit: an unresolvable model aborts the derive step", "commit-coauthor.mjs", promptFiles({
  "msg.txt": "feat: accept the note domain decision\n\nADR: 010\n",
}), { pass: false, matching: /cannot tell which model/, args: ["msg.txt", "message"], env: { PROTO_FORGE_MODEL: "" } });

expect("commit: a co-author that is not the cited entry's model fails", "commit-lint.mjs", promptFiles({
  "msg.txt": MSG_OK,
  ".prompts/0001-x.md": entryOn("standard-x"),
  "docs/adr/010-a-decision.md": adr("010", "accepted"),
}), { pass: false, matching: /no co-author trailer signs as it/, args: ["msg.txt"], prepare: stageWithRegistry });

expect("commit: a co-author matching the cited entry's model passes", "commit-lint.mjs", promptFiles({
  "msg.txt": `${MSG_UNSIGNED}Co-Authored-By: Standard X <standard@example.test>\n`,
  ".prompts/0001-x.md": entryOn("standard-x"),
  "docs/adr/010-a-decision.md": adr("010", "accepted"),
}), { pass: true, args: ["msg.txt"], prepare: stageWithRegistry });

// BR-49: a fix carries its regression test in the same commit — the defect
// that had no failing test is the defect that returns.
const MSG_FIX =
  "fix: repair the list ordering\n\nADR: 010\nPrompt-Log: .prompts/0001-x.md\n" +
  "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>\n";

expect("commit: a fix without a regression test fails", "commit-lint.mjs", {
  "msg.txt": MSG_FIX,
  "docs/adr/010-a-decision.md": adr("010", "accepted"),
  "src/features/order.ts": "export const order = 1;\n",
}, { pass: false, matching: /regression test/, args: ["msg.txt"], prepare: stageAll });

expect("commit: a fix with its regression test passes", "commit-lint.mjs", {
  "msg.txt": MSG_FIX,
  "docs/adr/010-a-decision.md": adr("010", "accepted"),
  "src/features/order.ts": "export const order = 1;\n",
  "src/features/order.test.ts": "it('keeps the order', () => {});\n",
}, { pass: true, args: ["msg.txt"], prepare: stageAll });

// --- consistency -------------------------------------------------------------
const PROBLEMS_MIN =
  "package app.platform\n\nobject Problems {\n    val PROBLEMS: Map<String, ProblemDef> = mapOf(\n" +
  '        "internal" to ProblemDef("internal", 500, "Unexpected failure"),\n    )\n}\n';
const consistencyBase = (over = {}) => ({
  "src/main/kotlin/app/config/Settings.kt":
    "package app.config\n\ndata class Settings(val port: Int) {\n    companion object {\n" +
    "        fun fromEnvironment(read: (String) -> String?): Settings = Settings(8080)\n    }\n}\n",
  "src/main/kotlin/app/platform/Problems.kt": PROBLEMS_MIN,
  "src/main/kotlin/app/adapters/in/http/RouteRegistry.kt":
    "package app.adapters.`in`.http\n\nobject RouteRegistry {\n    val ROUTES: List<RouteDef> = listOf()\n}\n",
  ...over,
});

expect("consistency: one definition per single-source registry passes", "consistency.mjs", consistencyBase(), {
  pass: true,
});

expect("consistency: a problem catalogue defined twice fails", "consistency.mjs", consistencyBase({
  "src/main/kotlin/app/application/Problems2.kt":
    "package app.application\n\nobject Problems2 {\n    val PROBLEMS: Map<String, ProblemDef> = mapOf()\n}\n",
}), { pass: false, matching: /defined 2x/ });

expect("consistency: two accepted ADRs sharing a title fails", "consistency.mjs", consistencyBase({
  "docs/adr/010-a.md": adr("010", "accepted"),
  "docs/adr/011-b.md": adr("011", "accepted"),
}), { pass: false, matching: /duplicate accepted ADR title/ });

expect("consistency: a non-English script in code fails", "consistency.mjs", consistencyBase({
  "src/main/kotlin/app/application/F.kt":
    'package app.application\n\nclass F {\n    val label = "Привет"\n}\n',
}), { pass: false, matching: /non-English/ });

// BR-12's dead-weight corollary: the node gate corpus is dependency-free by design,
// so a package.json runtime dependency no gate script imports ships attack surface
// for no behaviour. The JVM surface has its own gate (deps:budget).
expect("consistency: a runtime dependency nothing imports fails", "consistency.mjs", consistencyBase({
  "package.json": { dependencies: { "left-pad": "^1.3.0" } },
}), { pass: false, matching: /"left-pad" is imported by nothing/ });

expect("consistency: an imported runtime dependency passes", "consistency.mjs", consistencyBase({
  "package.json": { dependencies: { zod: "^4.1.5" } },
  "scripts/uses.mjs": 'import { z } from "zod";\nexport const S = z.string();\n',
}), { pass: true });

// --- snapshot:diff -----------------------------------------------------------
// The passing case needs a seed.lock holding a hash only the gate can compute, so
// `prepare` writes the baseline the way an operator would. The seed here is TWO
// trees hashed as one digest: the platform kernel and (in a real checkout) the
// gate corpus.
const snapshotBase = (over = {}) => ({
  "package.json": { version: "0.1.0", scripts: { verify: "pnpm run lint && pnpm run test:unit" } },
  "src/main/kotlin/app/platform/Kernel.kt": "package app.platform\n\nclass Kernel\n",
  "src/main/kotlin/app/domain/note/Note.kt": "package app.domain.note\n\ndata class Note(val id: String)\n",
  // The generated locks live here, and neither --write-seed nor --write creates
  // the directory: a prototype always has it, because the template ships it.
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
    seed: ["scripts", "src/main/kotlin/app/platform"],
    version: "0.1.0",
    sha256: "0000000000000000000000000000000000000000000000000000000000000000",
  },
}), { pass: false, matching: /seed integrity/ });

expect("snapshot: a file added after the baseline fails", "snapshot-diff.mjs", snapshotBase(), {
  pass: false,
  matching: /fileTree drifted/,
  prepare: (dir) => {
    writeBaseline(dir);
    writeFileSync(join(dir, "src", "main", "kotlin", "app", "domain", "Unexpected.kt"), "package app.domain\n\nclass Unexpected\n");
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

// --- sec:scan ----------------------------------------------------------------
// Only the deterministic half is self-testable: that the dependency audit
// cannot be silently skipped in CI. Their real findings need the
// external binaries, so CI running the real gate asserts those — recorded in
// references/requirements.md §19 rather than papered over.
expect("security: the dependency audit cannot be skipped in CI", "sec-scan.mjs", {}, {
  pass: false,
  matching: /mandatory/,
  env: { CI: "1", PATH: "" },
});

// --- arch:verify (BR-21) -----------------------------------------------------
// The style is a pure function of the facets (T15-T17): the record, the ArchUnit
// profile and the actual imports all have to agree with the derivation.
const FACETS_LAYERED = {
  facetsVersion: 2,
  entities: [{ name: "Note", fields: [{ name: "text", type: "string", required: true }] }],
  flows: [{ name: "manage-notes", actor: "user", steps: ["list notes", "create a note", "delete a note"] }],
  roles: ["user"],
  persistence: "api",
  locales: ["en"],
  nonFunctional: { offlineCapable: false, realtime: false },
  backend: { stack: "kotlin", externalSystems: [], persistence: "postgres", messaging: "none", authModel: "none" },
};
const ARCH_LAYERED = { style: "layered", inputs: { E: 1, X: 0, C: 1, flags: { messaging: "none", realtime: false } } };
const HEX_SYSTEMS = [
  { name: "Billing", kind: "rest", direction: "outbound" },
  { name: "Mailer", kind: "email", direction: "outbound" },
  { name: "Ledger", kind: "rest", direction: "outbound" },
];
const FACETS_HEX = { ...FACETS_LAYERED, backend: { ...FACETS_LAYERED.backend, externalSystems: HEX_SYSTEMS } };
const ARCH_HEX = { style: "hexagonal", inputs: { E: 1, X: 3, C: 1, flags: { messaging: "none", realtime: false } } };
// A stand-in with the live suite's load-bearing properties: it reads the record
// and defines an edge table per style — which is exactly what the gate asserts.
const ARCH_SUITE_STUB = `// selects its active edge table from .proto-forge/architecture.json, never hardcoded
class ArchitectureTest {
    private val edges: Map<String, Any> = mapOf(
        "layered" to listOf<String>(),
        "modular" to listOf<String>(),
        "hexagonal" to listOf<String>(),
    )
}
`;
const archBase = (over = {}) => ({
  ".proto-forge/facets.json": FACETS_LAYERED,
  ".proto-forge/architecture.json": ARCH_LAYERED,
  "src/test/kotlin/app/arch/ArchitectureTest.kt": ARCH_SUITE_STUB,
  "src/main/kotlin/app/domain/note/Note.kt":
    "package app.domain.note\n\nimport kotlinx.serialization.Serializable\n\n@Serializable\ndata class Note(val text: String)\n",
  "src/main/kotlin/app/application/Notes.kt":
    "package app.application\n\nimport app.domain.note.Note\n\nclass Notes {\n    lateinit var note: Note\n}\n",
  "src/main/kotlin/app/adapters/in/http/Routes.kt":
    "package app.adapters.`in`.http\n\nimport app.application.Notes\n\nclass Routes {\n    lateinit var notes: Notes\n}\n",
  ...over,
});

expect("arch: the derived style matching architecture.json passes", "arch-verify.mjs", archBase(), { pass: true });

expect("arch: a domain module importing a framework fails", "arch-verify.mjs", archBase({
  "src/main/kotlin/app/domain/note/Note.kt":
    "package app.domain.note\n\nimport io.ktor.server.routing.Routing\n\ndata class Note(val text: String)\n",
}), { pass: false, matching: /framework-free/ });

expect("arch: an adapter importing another adapter's internals fails", "arch-verify.mjs", archBase({
  ".proto-forge/facets.json": FACETS_HEX,
  ".proto-forge/architecture.json": ARCH_HEX,
  "src/main/kotlin/app/adapters/out/persistence/Db.kt":
    "package app.adapters.out.persistence\n\nclass Db\n",
  "src/main/kotlin/app/adapters/in/http/Handler.kt":
    "package app.adapters.`in`.http\n\nimport app.adapters.out.persistence.Db\n\nclass Handler {\n    lateinit var db: Db\n}\n",
}), { pass: false, matching: /does not allow that edge/ });

expect("arch: a profile disagreeing with the derived style fails", "arch-verify.mjs", archBase({
  ".proto-forge/facets.json": FACETS_HEX,
}), { pass: false, matching: /derive "hexagonal"/ });

// A missing derivation input is not a pass by absence.
expect("arch: missing facets.json fails as underivable", "arch-verify.mjs", archBase({
  ".proto-forge/facets.json": undefined,
}), { pass: false, matching: /derivation has no input/ });

// --- contract:verify (BR-22) -------------------------------------------------
// Fixtures run without a JVM: PROTO_FORGE_CONTRACT_EMIT names a plain .mjs
// emitter, printing the raw document the contractEmit slice would; the gate then
// normalizes it exactly like the live path. The committed fixture spec is the
// canonical (sorted-key) form, so normalize(emitted) == committed proves a pass.
const SPEC_JSON = JSON.stringify(
  {
    info: { title: "notes", version: "1.0.0" },
    openapi: "3.1.0",
    paths: { "/notes": { get: { operationId: "note-list", responses: { 200: { description: "ok" } } } } },
  },
  null,
  2,
) + "\n";
const sha256 = (text) => createHash("sha256").update(text).digest("hex");
const emitter = (body) => `process.stdout.write(${JSON.stringify(body)});\n`;
const contractBase = (over = {}) => ({
  "contract/openapi.json": SPEC_JSON,
  "contract/contract.lock": { sha256: sha256(SPEC_JSON), contractVersion: "1.0.0" },
  "emit.mjs": emitter(SPEC_JSON),
  ...over,
});
const emitEnv = { PROTO_FORGE_CONTRACT_EMIT: "emit.mjs" };

expect("contract: a committed spec matching the regeneration passes", "contract-verify.mjs", contractBase(), {
  pass: true,
  env: emitEnv,
});

expect("contract: code drift from the committed spec fails", "contract-verify.mjs", contractBase({
  "emit.mjs": emitter(SPEC_JSON.replace('"version": "1.0.0"', '"version": "1.1.0"')),
}), { pass: false, matching: /code drift from the committed spec/, env: emitEnv });

expect("contract: a stale contract.lock fails", "contract-verify.mjs", contractBase({
  "contract/contract.lock": {
    sha256: "0000000000000000000000000000000000000000000000000000000000000000",
    contractVersion: "1.0.0",
  },
}), { pass: false, matching: /stale contract\.lock/, env: emitEnv });

// --- contract:breaking (BR-22) -----------------------------------------------
const RELEASED = {
  openapi: "3.1.0",
  info: { title: "notes", version: "1.0.0" },
  paths: {
    "/notes": { get: { operationId: "note-list", responses: { 200: { description: "ok" } } } },
    "/notes/{id}": { get: { operationId: "note-get", responses: { 200: { description: "ok" } } } },
  },
};
const CURRENT_BREAKING = {
  ...RELEASED,
  paths: { "/notes": RELEASED.paths["/notes"] },
};
const CURRENT_ADDITIVE = {
  ...RELEASED,
  paths: {
    ...RELEASED.paths,
    "/health": { get: { operationId: "health-check", responses: { 200: { description: "ok" } } } },
  },
};

expect("contract: a breaking change without a major bump fails", "contract-breaking.mjs", {
  "contract/released/openapi.json": RELEASED,
  "contract/openapi.json": CURRENT_BREAKING,
  "contract/contract.lock": { sha256: "x", contractVersion: "1.1.0" },
}, { pass: false, matching: /a breaking change needs a contract major bump plus an ADR/ });

expect("contract: an additive change without a bump passes", "contract-breaking.mjs", {
  "contract/released/openapi.json": RELEASED,
  "contract/openapi.json": CURRENT_ADDITIVE,
  "contract/contract.lock": { sha256: "x", contractVersion: "1.1.0" },
}, { pass: true });

expect("contract: a breaking change under a major bump passes", "contract-breaking.mjs", {
  "contract/released/openapi.json": RELEASED,
  "contract/openapi.json": CURRENT_BREAKING,
  "contract/contract.lock": { sha256: "x", contractVersion: "2.0.0" },
}, { pass: true, matching: /covered by a contract major bump/ });

expect("contract: no released baseline is a first-release pass", "contract-breaking.mjs", {
  "contract/openapi.json": CURRENT_ADDITIVE,
}, { pass: true, matching: /no released baseline yet/ });

// --- error:catalog (BR-23) ---------------------------------------------------
const catalogue = (entries) =>
  `package app.platform\n\nobject Problems {\n    val PROBLEMS: Map<String, ProblemDef> = mapOf(\n${entries},\n    )\n}\n`;
const GOOD_ENTRIES = `        "validation-failed" to ProblemDef("validation-failed", 400, "The request does not match the schema"),
        "internal" to ProblemDef("internal", 500, "Unexpected failure"),
        "note-not-found" to ProblemDef("note-not-found", 404, "No note exists under this id")`;
const errorsBase = (over = {}) => ({
  "src/main/kotlin/app/platform/Problems.kt": catalogue(GOOD_ENTRIES),
  "src/main/kotlin/app/application/Notes.kt":
    'package app.application\n\nclass Notes {\n    fun get(): Any {\n        throw AppProblem("note-not-found")\n    }\n}\n',
  "src/main/kotlin/app/adapters/in/http/NoteRoutes.kt":
    "package app.adapters.`in`.http\n\nobject NoteRoutes {\n    val NOTE_ROUTES: List<RouteDef> = listOf(\n" +
    '        RouteDef(\n            operationId = "note-get",\n            path = "/notes/{id}",\n' +
    '            problems = listOf("validation-failed", "note-not-found"),\n        ),\n    )\n}\n',
  "docs/api/problems.md": "# Problem catalogue\n\nvalidation-failed, internal, note-not-found — each is an RFC 9457 problem type.\n",
  ...over,
});

expect("errors: a registered problem type passes", "error-catalog.mjs", errorsBase(), { pass: true });

expect("errors: an unregistered error shape fails", "error-catalog.mjs", errorsBase({
  "src/main/kotlin/app/application/Notes.kt":
    'package app.application\n\nclass Notes {\n    fun get(): Any {\n        throw AppProblem("ghost-error")\n    }\n}\n',
}), { pass: false, matching: /unregistered error shape/ });

expect("errors: a duplicate problem code fails", "error-catalog.mjs", errorsBase({
  "src/main/kotlin/app/platform/Problems.kt": catalogue(
    GOOD_ENTRIES + ',\n        "note-not-found" to ProblemDef("note-not-found", 404, "A second registration")',
  ),
}), { pass: false, matching: /duplicate problem code/ });

expect("errors: a stale catalogue entry fails", "error-catalog.mjs", errorsBase({
  "src/main/kotlin/app/platform/Problems.kt": catalogue(
    GOOD_ENTRIES + ',\n        "unused-thing" to ProblemDef("unused-thing", 410, "Nothing can emit this")',
  ),
  "docs/api/problems.md": "# Problem catalogue\n\nvalidation-failed, internal, note-not-found, unused-thing.\n",
}), { pass: false, matching: /stale catalogue entry/ });

// --- opid:scan (BR-25) -------------------------------------------------------
const routesKotlin = (defs) =>
  `package app.adapters.\`in\`.http\n\nobject Routes {\n    val ROUTES: List<RouteDef> = listOf(\n${defs},\n    )\n}\n`;
const DEF = (id, path) =>
  `        RouteDef(\n            operationId = "${id}",\n            path = "${path}",\n            problems = listOf(),\n        )`;
const opidBase = (over = {}) => ({
  "src/main/kotlin/app/adapters/in/http/Routes.kt": routesKotlin(`${DEF("note-list", "/notes")},\n${DEF("note-create", "/notes")}`),
  "src/main/kotlin/app/adapters/in/http/RouteRegistrar.kt":
    "package app.adapters.`in`.http\n\nobject RouteRegistrar {\n    fun wire() {\n        // registers every RouteDef on the router\n    }\n}\n",
  ...over,
});

expect("opid: unique deterministic operation ids pass", "opid-scan.mjs", opidBase(), { pass: true });

expect("opid: a duplicate operation id fails", "opid-scan.mjs", opidBase({
  "src/main/kotlin/app/adapters/in/http/Routes.kt": routesKotlin(`${DEF("note-list", "/notes")},\n${DEF("note-list", "/notes/all")}`),
}), { pass: false, matching: /declared twice/ });

expect("opid: a route path literal outside the registry fails", "opid-scan.mjs", opidBase({
  "src/main/kotlin/app/application/Sneaky.kt":
    'package app.application\n\nfun Routing.sneaky() {\n    get("/notes") {\n        call.respond("nope")\n    }\n}\n',
}), { pass: false, matching: /route path literal outside the registry/ });

expect("opid: an id without a resource-verb hyphen fails", "opid-scan.mjs", opidBase({
  "src/main/kotlin/app/adapters/in/http/Routes.kt": routesKotlin(DEF("notes", "/notes")),
}), { pass: false, matching: /kebab-case/ });

// --- migration:verify (BR-24) ------------------------------------------------
const MIG_SQL = "CREATE TABLE notes (\n  id uuid PRIMARY KEY,\n  text text NOT NULL\n);\n";
const TABLE_KOTLIN =
  "package app.adapters.out.persistence\n\nobject NotesTable : Table(\"notes\") {\n    val id = javaUUID(\"id\")\n}\n";
const migrationBase = (over = {}) => ({
  "src/main/resources/db/migration/V0001__create_notes.sql": MIG_SQL,
  "src/main/kotlin/app/adapters/out/persistence/NotesTable.kt": TABLE_KOTLIN,
  ...over,
});
const writeLedger = (dir) => run("migration-verify.mjs", dir, ["--write"]);

expect("migrations: an append-only history passes", "migration-verify.mjs", migrationBase(), {
  pass: true,
  prepare: writeLedger,
});

expect("migrations: a rewritten migration fails", "migration-verify.mjs", migrationBase(), {
  pass: false,
  matching: /a rewritten migration/,
  prepare: (dir) => {
    writeLedger(dir);
    writeFileSync(
      join(dir, "src", "main", "resources", "db", "migration", "V0001__create_notes.sql"),
      MIG_SQL.replace("text NOT NULL", "text"),
    );
  },
});

expect("migrations: a model the migrations do not produce fails", "migration-verify.mjs", migrationBase({
  "src/main/kotlin/app/adapters/out/persistence/GhostTable.kt":
    "package app.adapters.out.persistence\n\nobject GhostTable : Table(\"ghosts\") {\n    val id = javaUUID(\"id\")\n}\n",
}), { pass: false, matching: /a model the migrations do not produce/, prepare: writeLedger });

expect("migrations: a destructive statement without an ADR marker fails", "migration-verify.mjs", migrationBase({
  "src/main/resources/db/migration/V0002__drop_notes.sql": "DROP TABLE notes;\n",
}), { pass: false, matching: /@adr/, prepare: writeLedger });

// --- docs:verify + docs:examples (BR-26) -------------------------------------
// The capture seam: PROTO_FORGE_CAPTURE names a plain .mjs stand-in for the
// Gradle capture slice. docs-examples runs it, then pins the handler-source hash.
const DOCS_PROSE =
  "The note-list operation returns every note, newest first. Errors are problem+json from the registered catalogue, and the capture below is replayed by the conformance suite. ".repeat(2);
const CAPTURE_MJS = `import { mkdirSync, writeFileSync } from "node:fs";
mkdirSync("docs/api/note-list/examples", { recursive: true });
writeFileSync(
  "docs/api/note-list/examples/note-list.json",
  JSON.stringify({ request: { method: "GET", path: "/notes" }, response: { status: 200, body: [] } }, null, 2) + "\\n",
);
`;
const docsBase = (over = {}) => ({
  "src/main/kotlin/app/adapters/in/http/Routes.kt": routesKotlin(DEF("note-list", "/notes")),
  "src/main/kotlin/app/application/Notes.kt":
    "package app.application\n\nclass Notes {\n    fun list(): Any? = null\n}\n",
  "docs/api/note-list/README.md": `# note-list\n\n${DOCS_PROSE}\n`,
  "docs/api/problems.md": `# Problem catalogue\n\n${DOCS_PROSE}\n`,
  "capture.mjs": CAPTURE_MJS,
  ...over,
});
const captureExamples = (dir) => run("docs-examples.mjs", dir, [], { PROTO_FORGE_CAPTURE: "capture.mjs" });

expect("docs: an endpoint with a current captured example passes", "docs-verify.mjs", docsBase(), {
  pass: true,
  prepare: captureExamples,
});

expect("docs: a handler edit invalidates its example until docs:examples reruns", "docs-verify.mjs", docsBase(), {
  pass: false,
  matching: /examples are stale/,
  prepare: (dir) => {
    captureExamples(dir);
    writeFileSync(
      join(dir, "src", "main", "kotlin", "app", "application", "Notes.kt"),
      "package app.application\n\nclass Notes {\n    fun list(): Any? = listOf(1)\n}\n",
    );
  },
});

expect("docs: an endpoint with no example and no stated reason fails", "docs-verify.mjs", docsBase(), {
  pass: false,
  matching: /no captured example and no stated reason/,
});

expect("docs: a stated no-example reason stands in for a capture", "docs-verify.mjs", docsBase({
  "docs/api/note-list/README.md": `# note-list\n\n${DOCS_PROSE}\n\n<!-- no-example: a health probe has no meaningful exchange to capture -->\n`,
}), { pass: true });

// --- BR-42: the pages were written against decisions that still stand ---------
// The handler hash cannot see an ADR edit — change the decision, leave the handlers,
// and the captures still match while the pages document endpoints nobody decided on.
// The third case pins the direction that must NOT fire: a status flip is evidence
// moving, not the decision.
const ADR_DECISION = "## Context\n\nThe list endpoint needs a stable order.\n\n## Decision\n\nNewest first.\n";
const anchoredDocsBase = (over = {}) =>
  docsBase({
    "src/main/kotlin/app/application/Notes.kt": "// @adr 008 - newest-first ordering\npackage app.application\n\nclass Notes {\n    fun list(): Any? = null\n}\n",
    "docs/adr/008-ordering.md": `# ADR 008\n\n- Status: accepted\n${ADR_DECISION}`,
    ...over,
  });

expect("docs: a subject written against the current decision passes", "docs-verify.mjs", anchoredDocsBase(), {
  pass: true,
  prepare: captureExamples,
});

expect("docs: a subject written against an older decision fails", "docs-verify.mjs", anchoredDocsBase(), {
  pass: false,
  matching: /older ADR 008/,
  prepare: (dir) => {
    captureExamples(dir);
    writeFileSync(join(dir, "docs", "adr", "008-ordering.md"), "# ADR 008\n\n- Status: accepted\n## Decision\n\nOldest first.\n");
  },
});

expect("docs: a subject implementing a decision with no lock at all fails", "docs-verify.mjs", anchoredDocsBase(), {
  pass: false,
  matching: /which version of that decision/,
});

expect("docs: flipping an ADR's status does not stale the subject", "docs-verify.mjs", anchoredDocsBase(), {
  pass: true,
  prepare: (dir) => {
    captureExamples(dir);
    writeFileSync(
      join(dir, "docs", "adr", "008-ordering.md"),
      `# ADR 008\n\n- Status: proposed\n- Prompt-log: .prompts/0004-ordering.md\n${ADR_DECISION}`,
    );
  },
});

// --- deps:budget (NFR-13) ----------------------------------------------------
const gradleDeps = (deps) => `dependencies {\n${deps}\n}\n`;

expect("deps: a runtime dependency set under the ceiling passes", "deps-budget.mjs", {
  "build.gradle.kts": gradleDeps(
    '    implementation("io.ktor:ktor-server-core:3.2.4")\n    implementation("com.zaxxer:HikariCP:7.0.2")',
  ),
}, { pass: true });

expect("deps: a dependency past the ceiling fails without an ADR", "deps-budget.mjs", {
  "build.gradle.kts": gradleDeps(
    '    implementation("io.ktor:ktor-server-core:3.2.4")\n    implementation("com.zaxxer:HikariCP:7.0.2")\n    implementation("com.google.guava:guava:33.0.0-jre")',
  ),
}, { pass: false, matching: /a new runtime dependency is an ADR/ });

// --- log:scan (NFR-12) -------------------------------------------------------
const logBase = (over = {}) => ({
  "src/main/kotlin/app/platform/AppLogger.kt":
    "package app.platform\n\nimport org.slf4j.Logger\nimport org.slf4j.LoggerFactory\n\nclass AppLogger {\n    private val delegate: Logger = LoggerFactory.getLogger(AppLogger::class.java)\n}\n",
  "src/main/kotlin/app/application/Notes.kt":
    "package app.application\n\nimport app.platform.AppLogger\n\nclass Notes {\n    private val log = AppLogger.get(\"app.application.Notes\")\n\n    fun create(noteId: String) {\n        log.info(\"note created\", \"noteId\", noteId)\n    }\n}\n",
  ...over,
});

expect("logs: structured logger calls pass", "log-scan.mjs", logBase(), { pass: true });

expect("logs: a bare console/print in production code fails", "log-scan.mjs", logBase({
  "src/main/kotlin/app/application/Notes.kt":
    `package app.application\n\nclass Notes {\n    fun create() {\n        ${CONSOLE_CALL}"note created")\n    }\n}\n`,
}), { pass: false, matching: /bare console/ });

expect("logs: a PII field name in a log call fails", "log-scan.mjs", logBase({
  "src/main/kotlin/app/application/Notes.kt":
    "package app.application\n\nimport app.platform.AppLogger\n\nclass Notes {\n    private val log = AppLogger.get(\"app.application.Notes\")\n\n    fun login(password: String) {\n        log.info(\"login attempt\", \"password\", password)\n    }\n}\n",
}), { pass: false, matching: /PII field name/ });

expect("logs: pino imported outside the kernel fails", "log-scan.mjs", logBase({
  "src/main/kotlin/app/application/Notes.kt":
    "package app.application\n\nimport org.slf4j.LoggerFactory\n\nclass Notes {\n    val logger = LoggerFactory.getLogger(\"notes\")\n}\n",
}), { pass: false, matching: /outside src\/main\/kotlin\/app\/platform/ });


// --- config: the delivery declaration ----------------------------------------
// The pasted "credential" is deliberately low-entropy: the config gate rejects
// on SHAPE (not SCREAMING_SNAKE ⇒ not an env var name), and a high-entropy
// fixture would trip the tree's own secret scan — the counterexample must fail
// exactly one gate, the one under test.
expect(
  "config: a credential pasted into auth.tokenEnv fails",
  "config-cli.mjs",
  withConfig({
    environments: { dev: { auth: { tokenEnv: "aaaa-bbbb-cccc-dddd" } } },
  }),
  { pass: false, matching: /looks like a value, not an env var name/ },
);

expect(
  "config: prod cannot be the first enabled environment",
  "config-cli.mjs",
  withConfig({
    environments: {
      dev: { enabled: false },
      prod: { enabled: true, cluster: { namespace: "prod" } },
    },
  }),
  { pass: false, matching: /cannot be the first/ },
);

expect(
  "config: prod without required approval fails",
  "config-cli.mjs",
  withConfig({
    environments: { prod: { enabled: true, approval: "none", cluster: { namespace: "prod" } } },
  }),
  { pass: false, matching: /prod/ },
);

expect(
  "config: an enabled environment without a namespace fails",
  "config-cli.mjs",
  withConfig({
    environments: { sit: { enabled: true, cluster: { namespace: "" } } },
  }),
  { pass: false, matching: /cluster\.namespace/ },
);

expect(
  "config: compose flavor cannot carry a multi-environment chain",
  "config-cli.mjs",
  withConfig({
    deployment: { flavor: "compose" },
    environments: { sit: { enabled: true, cluster: { namespace: "sit" } } },
  }),
  { pass: false, matching: /compose/ },
);

// --- env:verify ----------------------------------------------------------------
// The declaration gate: .env.example ≡ the env single source, secrets travel by
// name, and enabled environment ⇔ values file ⇔ docs table — every copy is derived.
const EMPTY_TABLE = "# Deployment\n\n<!-- env-table:begin -->\n<!-- env-table:end -->\n";
// Kotlin's env surface is the FIXED four-key list env-verify.mjs documents from
// Settings — the passing fixture documents all four.
const ENV_EXAMPLE_OK = "PORT=8080\nLOG_LEVEL=info\n# DATABASE_URL=\nGIT_SHA=dev\n";
const envBase = (over = {}) => ({
  ".proto-forge/config.json": {},
  ".env.example": ENV_EXAMPLE_OK,
  "deploy/chart/values/dev.yaml": "environment: dev\n",
  "docs/DEPLOYMENT.md": EMPTY_TABLE,
  ...over,
});
// The table between the markers is generated, so the fixture generates it the
// way an operator would before comparing.
const writeEnvTable = (dir) => run("env-verify.mjs", dir, ["--write"]);

expect("env: enabled dev with its values file passes", "env-verify.mjs", envBase(), {
  pass: true,
  prepare: writeEnvTable,
});

expect(
  "env: an enabled environment without a values file fails",
  "env-verify.mjs",
  envBase({ "deploy/chart/values/dev.yaml": undefined }),
  { pass: false, matching: /dev\.yaml does not exist/, prepare: writeEnvTable },
);

expect(
  "env: a values file for a disabled environment fails",
  "env-verify.mjs",
  envBase({ "deploy/chart/values/sit.yaml": "environment: sit\n" }),
  { pass: false, matching: /orphan/, prepare: writeEnvTable },
);

expect(
  "env: a docs table that omits an enabled environment fails",
  "env-verify.mjs",
  envBase({
    "docs/DEPLOYMENT.md":
      "# Deployment\n\n<!-- env-table:begin -->\n| env | enabled | cluster.type | approval | url |\n| --- | --- | --- | --- | --- |\n| local | yes | — | — | http://localhost:8080 |\n<!-- env-table:end -->\n",
  }),
  { pass: false, matching: /drifted/ },
);

expect(
  "env: a secret-shaped value in a committed env file fails",
  "env-verify.mjs",
  envBase({ ".env.example": `${ENV_EXAMPLE_OK}API_TOKEN=aaaabbbbccccdddd\n` }),
  { pass: false, matching: /secret-shaped/, prepare: writeEnvTable },
);

expect(
  "env: a schema key the example never documents fails",
  "env-verify.mjs",
  envBase({ ".env.example": "PORT=8080\nLOG_LEVEL=info\n# DATABASE_URL=\n" }),
  { pass: false, matching: /missing GIT_SHA/, prepare: writeEnvTable },
);

// --- deploy:verify -------------------------------------------------------------
// Fixtures exercise the NATIVE half only: PATH is emptied so docker/helm/
// hadolint/kubeconform gate themselves off exactly as on a toolless laptop, and
// CI is cleared so the hard-stop does not fire inside a CI selftest run. The
// tool half is proven by CI running the real gate (the sec-scan precedent).
const noTools = { PATH: "", CI: "" };
const PINNED = `@sha256:${"a".repeat(64)}`;
const DOCKERFILE_OK =
  `FROM base-image:1${PINNED} AS build\n` +
  `FROM base-image:1${PINNED}\n` +
  `USER app\n` +
  `COPY --from=build /app /app\n`;
const COMPOSE_OK =
  'services:\n  app:\n    image: app:dev\n    healthcheck:\n      test: ["CMD", "true"]\n';
const VALUES_OK = [
  "resources:",
  "  limits:",
  "    cpu: 100m",
  "    memory: 128Mi",
  "probes:",
  "  readiness:",
  "    path: /healthz",
  "  liveness:",
  "    path: /version",
  "securityContext:",
  "  runAsNonRoot: true",
  "  allowPrivilegeEscalation: false",
  "  capabilities:",
  '    drop: ["ALL"]',
  "  seccompProfile:",
  "    type: RuntimeDefault",
  "  readOnlyRootFilesystem: true",
  "expose:",
  "  kind: none",
  "",
].join("\n");
const deployBase = (over = {}) => ({
  ".proto-forge/config.json": {},
  Dockerfile: DOCKERFILE_OK,
  "deploy/compose/docker-compose.yml": COMPOSE_OK,
  "deploy/chart/values.yaml": VALUES_OK,
  "deploy/chart/values/dev.yaml": "environment: dev\n",
  ...over,
});

expect("deploy: the gate passes with no network and no cluster configured", "deploy-verify.mjs", deployBase(), {
  pass: true,
  env: noTools,
});

// NFR-30: the pipeline's perf-smoke stage is part of the delivery surface — a
// workflow that lost the step, or its budgets, dropped the only coarse
// performance and image-size stop.
const PERF_WORKFLOW_OK =
  "name: package\njobs:\n  package:\n    steps:\n      - name: perf smoke\n" +
  '        env:\n          PERF_LATENCY_BUDGET_MS: "1000"\n          PERF_IMAGE_SIZE_BUDGET_MB: "400"\n' +
  "        run: echo smoke\n";

expect(
  "deploy: a package.yml with the perf-smoke stage passes",
  "deploy-verify.mjs",
  deployBase({ ".github/workflows/package.yml": PERF_WORKFLOW_OK }),
  { pass: true, env: noTools },
);

expect(
  "deploy: a package.yml without the perf-smoke stage fails",
  "deploy-verify.mjs",
  deployBase({
    ".github/workflows/package.yml": "name: package\njobs:\n  package:\n    steps:\n      - name: push\n        run: echo push\n",
  }),
  { pass: false, matching: /perf smoke/, env: noTools },
);

expect(
  "deploy: a perf-smoke stage without its budgets fails",
  "deploy-verify.mjs",
  deployBase({
    ".github/workflows/package.yml": "name: package\njobs:\n  package:\n    steps:\n      - name: perf smoke\n        run: echo smoke\n",
  }),
  { pass: false, matching: /ceiling/, env: noTools },
);

expect(
  "deploy: a Dockerfile with a floating base tag fails",
  "deploy-verify.mjs",
  deployBase({ Dockerfile: DOCKERFILE_OK.replace(`base-image:1${PINNED} AS build`, "base-image:1 AS build") }),
  { pass: false, matching: /pin it by digest/, env: noTools },
);

expect(
  "deploy: an ADD from a URL fails",
  "deploy-verify.mjs",
  deployBase({ Dockerfile: `${DOCKERFILE_OK}ADD https://example.com/tool.tar.gz /opt/\n` }),
  { pass: false, matching: /unverified bytes/, env: noTools },
);

expect(
  "deploy: a secret-shaped build ARG default fails",
  "deploy-verify.mjs",
  deployBase({ Dockerfile: `${DOCKERFILE_OK}ARG NPM_TOKEN=abc123\n` }),
  { pass: false, matching: /secret-shaped default/, env: noTools },
);

expect(
  "deploy: a compose service without a healthcheck fails",
  "deploy-verify.mjs",
  deployBase({ "deploy/compose/docker-compose.yml": "services:\n  app:\n    image: app:dev\n" }),
  { pass: false, matching: /healthcheck/, env: noTools },
);

expect(
  "deploy: a deployment without resource limits fails",
  "deploy-verify.mjs",
  deployBase({ "deploy/chart/values.yaml": VALUES_OK.replace("  limits:\n    cpu: 100m\n    memory: 128Mi\n", "") }),
  { pass: false, matching: /resources\.limits/, env: noTools },
);

expect(
  "deploy: a hardcoded runAsUser fails",
  "deploy-verify.mjs",
  deployBase({ "deploy/chart/values.yaml": VALUES_OK.replace("  runAsNonRoot: true", "  runAsNonRoot: true\n  runAsUser: 101") }),
  { pass: false, matching: /arbitrary-UID/, env: noTools },
);

expect(
  "deploy: a Route rendered for an aks environment fails",
  "deploy-verify.mjs",
  deployBase({
    ".proto-forge/config.json": { environments: { dev: { cluster: { type: "aks", namespace: "dev" } } } },
    "deploy/chart/values/dev.yaml": "expose:\n  kind: route\n",
  }),
  { pass: false, matching: /OpenShift-only/, env: noTools },
);

expect(
  "deploy: an undated trivyignore entry fails",
  "deploy-verify.mjs",
  deployBase({ ".trivyignore": "CVE-2026-0001\n" }),
  { pass: false, matching: /no "# reason:/, env: noTools },
);

expect(
  "deploy: an expired trivyignore entry fails",
  "deploy-verify.mjs",
  deployBase({ ".trivyignore": "# reason: dev-only base image finding until: 2026-01-01\nCVE-2026-0001\n" }),
  { pass: false, matching: /expired/, env: noTools },
);

// --- deploy consent ------------------------------------------------------------
// BR-28's operator half. assertMayDeploy (deploy-lib.mjs) mirrors
// assertMayCommit door for door, and these cases walk the doors exactly like
// the sync-jira consent cases above: break one thing, expect the right door to
// refuse. No cluster and no network anywhere — every door closes before a
// socket could open, and the one helm-needing case gates itself off like
// deploy:verify's tool half.
const DEPLOY_SERVER = "https://cluster.example.com:6443";
const stageRender = (env) => (dir) => {
  // The staged-first door checks for a render an operator could have read;
  // the fixture stages one the way a prior `env:remote render` would have.
  mkdirSync(join(dir, ".proto-forge", "outbox", `deploy-${env}`), { recursive: true });
  writeFileSync(join(dir, ".proto-forge", "outbox", `deploy-${env}`, "manifests.yaml"), "kind: List\nitems: []\n");
};
const kubeconfigFor = (server, namespace) =>
  [
    "apiVersion: v1",
    "kind: Config",
    "current-context: fixture",
    "clusters:",
    "  - name: fixture",
    "    cluster:",
    `      server: ${server}`,
    "contexts:",
    "  - name: fixture",
    "    context:",
    "      cluster: fixture",
    "      user: fixture",
    `      namespace: ${namespace}`,
    "users:",
    "  - name: fixture",
    "    user: {}",
    "",
  ].join("\n");

expect(
  "deploy: --commit is refused while the network guardrail is closed",
  "env-remote.mjs",
  withConfig({
    environments: { dev: { cluster: { server: DEPLOY_SERVER } } },
    guardrails: { network: { allow: false } },
  }),
  {
    pass: false,
    matching: /network access is disabled/,
    args: ["deploy", "--env", "dev", "--commit", "--approve"],
    prepare: stageRender("dev"),
  },
);

// autoDeploy is standing consent for exactly one thing: the per-run --approve.
// The auth door sits AFTER the approval door, so "fails asking for KUBECONFIG"
// proves the approval was satisfied — without touching any cluster.
const autoDeployConfig = (extraEnvs = {}) =>
  withConfig({
    environments: {
      dev: { autoDeploy: true, cluster: { server: DEPLOY_SERVER } },
      ...extraEnvs,
    },
    guardrails: { network: { allow: true, allowedHosts: ["cluster.example.com"] } },
  });

expect(
  "deploy: autoDeploy stands in for --approve",
  "env-remote.mjs",
  autoDeployConfig(),
  {
    pass: false,
    matching: /KUBECONFIG is not set/,
    args: ["deploy", "--env", "dev", "--commit"],
    env: { KUBECONFIG: "" },
    prepare: stageRender("dev"),
  },
);

// Standing consent is scoped to ITS environment: dev's autoDeploy approves dev
// and nothing else — sit still demands its own --approve (or its own flag).
expect(
  "deploy: autoDeploy on dev does not approve sit",
  "env-remote.mjs",
  autoDeployConfig({ sit: { enabled: true, cluster: { server: DEPLOY_SERVER, namespace: "sit" } } }),
  {
    pass: false,
    matching: /requires explicit approval/,
    args: ["deploy", "--env", "sit", "--commit"],
    env: { KUBECONFIG: "" },
    prepare: stageRender("sit"),
  },
);

// The door assertMayCommit has no analogue for: helm acts on the CURRENT
// kubectl context, so a context aimed at a cluster the config does not name is
// refused even after every consent door opened.
expect(
  "deploy: a context pointing at a different server is refused",
  "env-remote.mjs",
  autoDeployConfig(),
  {
    pass: false,
    matching: /current kubectl context points at/,
    args: ["deploy", "--env", "dev", "--commit", "--approve"],
    env: { KUBECONFIG: "kubeconfig.yaml" },
    prepare: (dir) => {
      stageRender("dev")(dir);
      writeFileSync(join(dir, "kubeconfig.yaml"), kubeconfigFor("https://other.example.com:6443", "dev"));
    },
  },
);

// The hard rule with no flag past it: bootstrap applies everything EXCEPT the
// Secret skeleton. Every consent door is open here (context matches too); PATH
// is emptied so kubectl gates the apply off AFTER the plan is printed — the
// exclusion is decided and stated before anything could reach a cluster.
expect(
  "deploy: secrets are never applied, even with --commit --approve",
  "env-remote.mjs",
  autoDeployConfig(),
  {
    pass: false,
    matching: /secret\.yaml SKIPPED/,
    args: ["bootstrap", "--env", "dev", "--commit", "--approve"],
    env: { KUBECONFIG: "kubeconfig.yaml", PATH: "", CI: "" },
    prepare: (dir) => writeFileSync(join(dir, "kubeconfig.yaml"), kubeconfigFor(DEPLOY_SERVER, "dev")),
  },
);

inlineCase("deploy: render stages to the outbox without touching a cluster");
// render is an OFFLINE `helm template` into the outbox — the staged artefact
// deploy replays. helm-gated exactly like deploy:verify's tool half: enforced
// when installed (always, in CI), one loud note otherwise.
{
  let helmPresent = true;
  try {
    execSync("command -v helm", { stdio: "ignore" });
  } catch {
    helmPresent = false;
  }
  if (!helmPresent) {
    process.stderr.write("⚠ deploy: render selftest skipped — helm not installed (CI enforces the deploy toolchain)\n");
  } else {
    const dir = project(withConfig({}));
    try {
      cpSync(join(SCRIPTS, "..", "deploy", "chart"), join(dir, "deploy", "chart"), { recursive: true });
      const { code, out } = run("env-remote.mjs", dir, ["render", "--env", "dev"]);
      const staged = join(dir, ".proto-forge", "outbox", "deploy-dev", "manifests.yaml");
      if (code !== 0) {
        results.push(`deploy: render stages to the outbox without touching a cluster — render failed: ${out.trim()}`);
      } else if (!existsSync(staged)) {
        results.push("deploy: render stages to the outbox without touching a cluster — nothing landed in the outbox");
      } else if (!/no cluster was touched/.test(out)) {
        results.push(`deploy: render stages to the outbox without touching a cluster — the message must say so: ${out.trim()}`);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
}

// --- status: the documented numbers are the measured numbers --------------------
// BR-36. quality:report distils the tiers' machine outputs into quality.json and
// regenerates the STATUS.md block; status:verify re-derives both and holds the
// config mirrors (floors, chain, contract counts) to their sources. The fixtures
// fabricate the machine outputs the reporters would have written, run the
// producer, then break exactly one copy.
const BUILD_GRADLE_QUALITY = (breakAt = 85) =>
  "tasks.jacocoTestCoverageVerification {\n" +
  "    violationRules {\n" +
  "        rule {\n" +
  '            limit { minimum = "1.00".toBigDecimal() }\n' +
  "        }\n" +
  "    }\n" +
  "}\n" +
  `pitest {\n    mutationThreshold = ${breakAt}\n}\n`;
const GRADLE_SUITE = (name, tests) =>
  `<?xml version="1.0" encoding="UTF-8"?>\n<testsuite name="${name}" tests="${tests}" skipped="0" failures="0" errors="0" time="0.1">\n` +
  Array.from({ length: tests }, (_, i) => `<testcase name="case${i}" classname="${name}" time="0.01"/>`).join("\n") +
  "\n</testsuite>\n";
const JACOCO_XML =
  '<?xml version="1.0" encoding="UTF-8"?><report name="app">' +
  '<package name="app/domain">' +
  '<class name="app/domain/Note"><counter type="INSTRUCTION" missed="0" covered="60"/><counter type="BRANCH" missed="0" covered="8"/><counter type="LINE" missed="0" covered="20"/></class>' +
  '<counter type="INSTRUCTION" missed="0" covered="120"/><counter type="BRANCH" missed="0" covered="16"/><counter type="LINE" missed="0" covered="40"/>' +
  "</package>" +
  '<package name="app/adapters"><counter type="INSTRUCTION" missed="50" covered="50"/></package>' +
  "</report>\n";
const PIT_XML = (killed, survived) =>
  '<?xml version="1.0" encoding="UTF-8"?><mutations>\n' +
  Array.from({ length: killed }, () => "<mutation detected='true' status='KILLED'><mutatedClass>app.domain.Note</mutatedClass></mutation>").join("\n") +
  "\n" +
  Array.from({ length: survived }, () => "<mutation detected='false' status='SURVIVED'><mutatedClass>app.domain.Note</mutatedClass></mutation>").join("\n") +
  "\n</mutations>\n";
const statusProject = (over = {}) => ({
  ".proto-forge/config.json": {},
  "package.json": { scripts: { verify: "pnpm run test:unit && pnpm run status:verify" } },
  "build.gradle.kts": BUILD_GRADLE_QUALITY(),
  "build/test-results/test/TEST-app.domain.NoteTest.xml": GRADLE_SUITE("app.domain.NoteTest", 3),
  "build/test-results/test/TEST-app.application.NoteServiceTest.xml": GRADLE_SUITE("app.application.NoteServiceTest", 2),
  "build/reports/jacoco/test/jacocoTestReport.xml": JACOCO_XML,
  "build/reports/pitest/mutations.xml": PIT_XML(9, 1),
  ".proto-forge/e2e-results.json": { scenarios: 3, passed: 3 },
  "contract/openapi.json": { openapi: "3.1.0", paths: { "/notes": { get: {}, post: {} } } },
  "src/main/kotlin/app/platform/Problems.kt":
    'object Problems {\n    val PROBLEMS: Map<String, ProblemDef> = mapOf(\n        "validation-failed" to ProblemDef("validation-failed", 400, "x"),\n        "internal" to ProblemDef("internal", 500, "x"),\n    )\n}\n',
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
    writeFileSync(doc, readFileSync(doc, "utf8").replace("5/5 passed", "999/999 passed"));
  },
});

expect("status: a threshold mirror disagreeing with the config fails", "status-verify.mjs", statusProject(), {
  pass: false,
  matching: /thresholds\.mutation/,
  prepare: (dir) => {
    writeQuality(dir);
    writeFileSync(join(dir, "build.gradle.kts"), BUILD_GRADLE_QUALITY(80));
  },
});

expect("status: a gate chain mirror disagreeing with package.json fails", "status-verify.mjs", statusProject(), {
  pass: false,
  matching: /gates\.chain/,
  prepare: (dir) => {
    writeQuality(dir);
    writeFileSync(join(dir, "package.json"), JSON.stringify({ scripts: { verify: "pnpm run test:unit" } }, null, 2));
  },
});

expect("status: a missing quality.json fails", "status-verify.mjs", statusProject(), {
  pass: false,
  matching: /quality\.json is missing/,
});

// --- doctor ------------------------------------------------------------------
// NFR-18. The doctor is a support tool, so the contract under test is the useful
// half: a finding names its fix. PROTO_FORGE_DOCTOR_PORTS="" skips the port
// probe so a dev server on the operator's machine cannot flake the selftest;
// the engines fixture matches the running node so the clean case passes anywhere,
// and the fixtures ship no build.gradle.kts so the JVM probes stay out of scope.
const doctorBase = (over = {}) => ({
  "package.json": { engines: { node: `>=${process.versions.node.split(".")[0]}` } },
  ...over,
});
const noPorts = { PROTO_FORGE_DOCTOR_PORTS: "" };

expect("doctor: a clean tree passes", "doctor.mjs", doctorBase(), { pass: true, env: noPorts });

expect(
  "doctor: a stale mutation cache is named with its fix",
  "doctor.mjs",
  doctorBase({ "build/reports/pitest/mutations.xml": "<mutations/>\n", "src/main/kotlin/app/A.kt": "class A\n" }),
  {
    pass: false,
    matching: /rm -rf build\/reports\/pitest/,
    env: noPorts,
    // The report predates the source by construction: epoch mtime, no clock math.
    prepare: (dir) => utimesSync(join(dir, "build", "reports", "pitest", "mutations.xml"), new Date(0), new Date(0)),
  },
);

expect(
  "doctor: a missing env file is named with its fix",
  "doctor.mjs",
  doctorBase({ ".env.example": "PORT=\n" }),
  { pass: false, matching: /cp \.env\.example \.env/, env: noPorts },
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
    "fixture-gate.mjs": 'process.stdout.write("✗ sec FAILED\\n    secret scan found secrets\\n");\nprocess.exit(1);\n',
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
ok("gates:selftest: every gate, guardrail and converter rejects what it claims to reject");

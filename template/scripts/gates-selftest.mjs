import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fail, ok } from "./lib.mjs";

// @adr 009 - the gates are the product, so the gates get tested
// A gate nobody has seen fail is a gate nobody knows works. This builds a throwaway
// project per case, breaks exactly one thing, and asserts the gate's exit code.
// Run it after touching any scan script: `pnpm gates:selftest`.

const SCRIPTS = resolve(dirname(new URL(import.meta.url).pathname));
const results = [];

function project(files) {
  const dir = mkdtempSync(join(tmpdir(), "proto-forge-gate-"));
  for (const [path, body] of Object.entries(files)) {
    const full = join(dir, path);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, typeof body === "string" ? body : JSON.stringify(body, null, 2));
  }
  return dir;
}

function run(gate, dir, args = []) {
  // HOME is redirected so an operator's ~/.config/proto-forge/config.json cannot
  // change the outcome of a self-test.
  const r = spawnSync(process.execPath, [join(SCRIPTS, gate), ...args], {
    cwd: dir,
    encoding: "utf8",
    env: { ...process.env, HOME: dir, PROTO_FORGE_TODAY: "2026-08-11" },
  });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
}

function expect(name, gate, files, { pass, matching, args = [] }) {
  const dir = project(files);
  try {
    const { code, out } = run(gate, dir, args);
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

// --- i18n --------------------------------------------------------------------
const i18nConfig = `export const DEFAULT_LOCALE = "en" as const;
export const SUPPORTED_LOCALES = ["en", "cs"] as const;
`;
const i18nRuntime = `import en from "./locales/en.json";
import cs from "./locales/cs.json";
export const resources = { en, cs };
`;
const feature = `export const F = () => t("app.save") + t("app.greeting");`;

const baseline = (overrides = {}) => ({
  "src/i18n/config.ts": i18nConfig,
  "src/i18n/index.ts": i18nRuntime,
  "src/i18n/locales/en.json": { app: { save: "Save", greeting: "Hello {{name}}" } },
  "src/i18n/locales/cs.json": { app: { save: "Uložit", greeting: "Ahoj {{name}}" } },
  "src/features/f.ts": feature,
  ...overrides,
});

expect("i18n: a fully translated locale passes", "i18n-verify.mjs", baseline(), { pass: true });

expect(
  "i18n: an untranslated value copied from English fails",
  "i18n-verify.mjs",
  baseline({ "src/i18n/locales/cs.json": { app: { save: "Save", greeting: "Ahoj {{name}}" } } }),
  { pass: false, matching: /byte-identical/ },
);

expect(
  "i18n: an empty value fails",
  "i18n-verify.mjs",
  baseline({ "src/i18n/locales/cs.json": { app: { save: "", greeting: "Ahoj {{name}}" } } }),
  { pass: false, matching: /empty/ },
);

expect(
  "i18n: a TODO placeholder fails",
  "i18n-verify.mjs",
  baseline({ "src/i18n/locales/cs.json": { app: { save: "TODO", greeting: "Ahoj {{name}}" } } }),
  { pass: false, matching: /placeholder/ },
);

expect(
  "i18n: a missing translation fails",
  "i18n-verify.mjs",
  baseline({ "src/i18n/locales/cs.json": { app: { greeting: "Ahoj {{name}}" } } }),
  { pass: false, matching: /missing key/ },
);

expect(
  "i18n: a dropped interpolation fails",
  "i18n-verify.mjs",
  baseline({ "src/i18n/locales/cs.json": { app: { save: "Uložit", greeting: "Ahoj" } } }),
  { pass: false, matching: /interpolates/ },
);

expect(
  "i18n: a locale nobody imports fails",
  "i18n-verify.mjs",
  baseline({ "src/i18n/index.ts": `import en from "./locales/en.json";\nexport const resources = { en };` }),
  { pass: false, matching: /never imports/ },
);

expect(
  "i18n: an undeclared catalogue on disk fails",
  "i18n-verify.mjs",
  baseline({ "src/i18n/locales/de.json": { app: { save: "Speichern", greeting: "Hallo {{name}}" } } }),
  { pass: false, matching: /not in SUPPORTED_LOCALES/ },
);

expect(
  "i18n: a computed key fails without a declaration",
  "i18n-verify.mjs",
  baseline({ "src/features/f.ts": "export const F = (k: string) => t(`app.${k}`) + t('app.save') + t('app.greeting');" }),
  { pass: false, matching: /computed key/ },
);

expect(
  "i18n: a declared computed key passes and is still checked",
  "i18n-verify.mjs",
  baseline({
    "src/features/f.ts":
      "// i18n-dynamic: app.save, app.greeting\nexport const F = (k: string) => t(`app.${k}`);",
  }),
  { pass: true },
);

expect(
  "i18n: a catalogue entry no code uses fails",
  "i18n-verify.mjs",
  baseline({
    "src/i18n/locales/en.json": { app: { save: "Save", greeting: "Hello {{name}}", ghost: "Unused" } },
    "src/i18n/locales/cs.json": { app: { save: "Uložit", greeting: "Ahoj {{name}}", ghost: "Nepoužito" } },
  }),
  { pass: false, matching: /never used in code/ },
);

expect(
  "i18n: an allowlisted proper noun may stay identical",
  "i18n-verify.mjs",
  baseline({
    "src/i18n/locales/en.json": { app: { save: "Save", greeting: "Hello {{name}}", brand: "Figma" } },
    "src/i18n/locales/cs.json": { app: { save: "Uložit", greeting: "Ahoj {{name}}", brand: "Figma" } },
    "src/i18n/identical-ok.json": { "app.brand": "product name, identical in every locale" },
    "src/features/f.ts": `${feature}\nexport const G = () => t("app.brand");`,
  }),
  { pass: true },
);

expect(
  "i18n: a stale allowlist entry fails",
  "i18n-verify.mjs",
  baseline({ "src/i18n/identical-ok.json": { "app.save": "no longer identical anywhere" } }),
  { pass: false, matching: /stale/ },
);

expect(
  "i18n: Czech plural forms English does not need are required",
  "i18n-verify.mjs",
  {
    "src/i18n/config.ts": i18nConfig,
    "src/i18n/index.ts": i18nRuntime,
    "src/i18n/locales/en.json": { app: { note_one: "{{count}} note", note_other: "{{count}} notes" } },
    "src/i18n/locales/cs.json": { app: { note_one: "{{count}} poznámka", note_other: "{{count}} poznámek" } },
    "src/features/f.ts": `export const F = () => t("app.note", { count: 2 });`,
  },
  { pass: false, matching: /missing the "few" form/ },
);

// --- layer -------------------------------------------------------------------
const TOKENS = `export const tokens = {
  layer: { base: 0, raised: 10, sticky: 100, overlay: 1000, modal: 1010, popover: 1100, toast: 1200, tooltip: 1300 },
} as const;
`;
const layerProject = (component) => ({
  "packages/proto-ui/tokens.ts": TOKENS,
  "src/features/Popup.tsx": component,
});

expect(
  "layer: a portalled overlay on a layer token passes",
  "layer-scan.mjs",
  layerProject(
    `import { tokens } from "../../packages/proto-ui/tokens";
export const P = () => (
  <Portal>
    <div style={{ position: "fixed", zIndex: tokens.layer.modal }} />
  </Portal>
);`,
  ),
  { pass: true },
);

expect(
  "layer: a hardcoded z-index fails",
  "layer-scan.mjs",
  layerProject(
    `export const P = () => (
  <Portal>
    <div style={{ position: "fixed", zIndex: 9999 }} />
  </Portal>
);`,
  ),
  { pass: false, matching: /one stacking scale/ },
);

expect(
  "layer: an out-of-flow element without a layer fails",
  "layer-scan.mjs",
  layerProject(`export const P = () => <div style={{ position: "absolute", top: 0 }} />;`),
  { pass: false, matching: /without a zIndex/ },
);

expect(
  "layer: a fixed surface rendered in place, without a portal, fails",
  "layer-scan.mjs",
  layerProject(
    `import { tokens } from "../../packages/proto-ui/tokens";
export const P = () => <div style={{ position: "fixed", zIndex: tokens.layer.modal }} />;`,
  ),
  { pass: false, matching: /without <Portal>/ },
);

expect(
  "layer: a scale that puts toasts under modals fails",
  "layer-scan.mjs",
  {
    "packages/proto-ui/tokens.ts": `export const tokens = {
  layer: { base: 0, raised: 10, sticky: 100, overlay: 1000, modal: 1010, popover: 1100, toast: 5, tooltip: 1300 },
} as const;
`,
  },
  { pass: false, matching: /must sit above/ },
);

// --- testid ------------------------------------------------------------------
expect(
  "testid: distinct testids pass",
  "testid-scan.mjs",
  {
    "src/features/a.tsx": `export const A = () => <button data-testid="notes-submit" />;`,
    "src/features/b.tsx": `export const B = () => <button data-testid="login-submit" />;`,
  },
  { pass: true },
);

expect(
  "testid: the same testid in two features fails",
  "testid-scan.mjs",
  {
    "src/features/a.tsx": `export const A = () => <button data-testid="submit" />;`,
    "src/features/b.tsx": `export const B = () => <button data-testid="submit" />;`,
  },
  { pass: false, matching: /collide/ },
);

expect(
  "testid: a non-kebab-case testid fails",
  "testid-scan.mjs",
  { "src/features/a.tsx": `export const A = () => <button data-testid="submitButton" />;` },
  { pass: false, matching: /kebab-case/ },
);

// --- config ------------------------------------------------------------------
const withConfig = (config, extra = {}) => ({
  ".proto-forge/config.json": config,
  "docs/adr/150-english-only-pilot.md": "# ADR 150: English-only pilot\n\n- Status: accepted\n",
  ...extra,
});

expect("config: the strict default passes", "config-cli.mjs", withConfig({}), { pass: true });

expect(
  "config: relaxing a mandatory gate without a waiver fails",
  "config-cli.mjs",
  withConfig({ gates: { i18n: { mode: "warn" } } }),
  { pass: false, matching: /mandatory/ },
);

expect(
  "config: a complete waiver passes and is reported",
  "config-cli.mjs",
  withConfig({
    gates: { i18n: { mode: "warn" } },
    waivers: [{ gate: "i18n", reason: "single-locale pilot for the September demo", adr: 150, expires: "2026-12-31" }],
  }),
  { pass: true, matching: /waived/i },
);

expect(
  "config: a waiver citing an ADR that does not exist fails",
  "config-cli.mjs",
  withConfig({
    gates: { i18n: { mode: "warn" } },
    waivers: [{ gate: "i18n", reason: "single-locale pilot for the September demo", adr: 999, expires: "2026-12-31" }],
  }),
  { pass: false, matching: /does not exist/ },
);

expect(
  "config: a waiver with no real justification fails",
  "config-cli.mjs",
  withConfig({
    gates: { i18n: { mode: "warn" } },
    waivers: [{ gate: "i18n", reason: "later", adr: 150, expires: "2026-12-31" }],
  }),
  { pass: false, matching: /explain/ },
);

expect(
  "config: a waiver for a gate that is not relaxed fails as dead paperwork",
  "config-cli.mjs",
  withConfig({
    waivers: [{ gate: "i18n", reason: "single-locale pilot for the September demo", adr: 150, expires: "2026-12-31" }],
  }),
  { pass: false, matching: /stale waiver/ },
);

// An expired waiver must not merely warn: the gate has to be enforcing again.
{
  const dir = project(
    withConfig(
      {
        gates: { i18n: { mode: "off" } },
        waivers: [{ gate: "i18n", reason: "single-locale pilot for the September demo", adr: 150, expires: "2026-01-01" }],
      },
      baseline({ "src/i18n/locales/cs.json": { app: { save: "Save", greeting: "Ahoj {{name}}" } } }),
    ),
  );
  try {
    const { code, out } = run("i18n-verify.mjs", dir);
    if (code === 0) results.push(`config: an expired waiver must stop disabling the gate — i18n passed anyway: ${out.trim()}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// A live waiver really does downgrade the same failure to a warning.
{
  const dir = project(
    withConfig(
      {
        gates: { i18n: { mode: "warn" } },
        waivers: [{ gate: "i18n", reason: "single-locale pilot for the September demo", adr: 150, expires: "2026-12-31" }],
      },
      baseline({ "src/i18n/locales/cs.json": { app: { save: "Save", greeting: "Ahoj {{name}}" } } }),
    ),
  );
  try {
    const { code, out } = run("i18n-verify.mjs", dir);
    if (code !== 0) results.push(`config: a live waiver should downgrade i18n to a warning — it still failed: ${out.trim()}`);
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

const seedFile = "packages/proto-ui/src/Button.tsx";

hook(
  "hook: editing the byte-pinned seed is blocked",
  "guard-write.mjs",
  { tool_name: "Edit", tool_input: { file_path: seedFile, new_string: "x" } },
  { [seedFile]: "export const Button = () => null;", ".proto-forge/config.json": {} },
  { blocked: true, matching: /byte-pinned/ },
);

hook(
  "hook: an ordinary feature edit is allowed",
  "guard-write.mjs",
  { tool_name: "Edit", tool_input: { file_path: "src/features/a.tsx", new_string: "x" } },
  { "src/features/a.tsx": "export const A = () => null;", ".proto-forge/config.json": {} },
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
  "hook: lowering a coverage threshold is blocked",
  "guard-write.mjs",
  { tool_name: "Edit", tool_input: { file_path: "vite.config.ts", new_string: "statements: 40," } },
  { "vite.config.ts": "export default {};", ".proto-forge/config.json": {} },
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
      "<!-- no-screenshot: nothing to show -->",
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
      "```ts",
      "const x = 1 < 2;",
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
    ["<![CDATA[const x = 1 < 2;]]>", "code block, unescaped inside CDATA"],
  ];
  for (const [needle, what] of must) {
    if (!storage.includes(needle)) results.push(`md-to-storage: ${what} missing — expected ${needle}`);
  }
  if (storage.includes("no-screenshot")) results.push("md-to-storage: HTML comments must not reach the page");
  if (!attachments.includes("open.png")) results.push("md-to-storage: image was not reported as an attachment");
}

if (results.length) fail(`gates:selftest FAILED (${results.length})`, results);
ok("gates:selftest: every gate, guardrail and converter rejects what it claims to reject");

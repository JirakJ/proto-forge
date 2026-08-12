import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
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
 * throwaway dir as its argument. Two gates need it: snapshot:diff, whose passing
 * case requires a seed.lock containing a hash only the gate itself can compute,
 * and budget, whose fixtures are too large to hold as string literals.
 * `env` overrides the child environment — sec:scan's CI hard-stop is only
 * observable with an empty PATH.
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

// --- docs:verify -------------------------------------------------------------
// Nine gates below had no self-test at all, while AGENTS.md claimed this command
// "proves each gate still rejects what it claims to". For docs:verify the untested
// claim was the load-bearing one: that a screenshot taken from OLDER code fails.
const PROSE = "The Button primitive takes a variant and a required testid. ".repeat(5);

const docsBase = (over = {}) => ({
  "packages/proto-ui/src/index.ts": 'export { Button } from "./Button";\n',
  "packages/proto-ui/src/Button.tsx": "export function Button() {\n  return null;\n}\n",
  ...over,
});

expect("docs: a page that states why there is no screenshot passes", "docs-verify.mjs", docsBase({
  "docs/components/Button/README.md": `# Button\n\n${PROSE}\n\n<!-- no-screenshot: a headless primitive renders nothing of its own -->\n`,
}), { pass: true });

expect("docs: a component with no page fails", "docs-verify.mjs", docsBase(), {
  pass: false,
  matching: /is missing/,
});

expect("docs: a stub page fails", "docs-verify.mjs", docsBase({
  "docs/components/Button/README.md": "# Button\n\nTODO.\n",
}), { pass: false, matching: /stub/ });

expect("docs: a page with neither a screenshot nor a stated reason fails", "docs-verify.mjs", docsBase({
  "docs/components/Button/README.md": `# Button\n\n${PROSE}\n`,
}), { pass: false, matching: /no screenshot/ });

expect("docs: a page referencing a screenshot that is not on disk fails", "docs-verify.mjs", docsBase({
  "docs/components/Button/README.md": `# Button\n\n${PROSE}\n\n![variants](./variants.png)\n`,
}), { pass: false, matching: /does not exist/ });

expect("docs: screenshots with nothing recording which code they show fail", "docs-verify.mjs", docsBase({
  "docs/components/Button/README.md": `# Button\n\n${PROSE}\n\n![variants](./variants.png)\n`,
  "docs/components/Button/variants.png": "png-bytes",
}), { pass: false, matching: /nothing records/ });

expect("docs: a screenshot taken from older code fails", "docs-verify.mjs", docsBase({
  "docs/components/Button/README.md": `# Button\n\n${PROSE}\n\n![variants](./variants.png)\n`,
  "docs/components/Button/variants.png": "png-bytes",
  "docs/components/Button/.shot.lock": { source: "0000000000000000000000000000000000000000000000000000000000000000" },
}), { pass: false, matching: /older/ });

// --- stub:scan ---------------------------------------------------------------
expect("stub: clean production code passes", "stub-scan.mjs", {
  "src/features/f.ts": "export const f = () => 1;\n",
}, { pass: true });

expect("stub: a banned marker in production code fails", "stub-scan.mjs", {
  "src/features/f.ts": "// TODO: finish this\nexport const f = () => 1;\n",
}, { pass: false, matching: /banned marker/ });

expect("stub: 'not implemented' in production code fails", "stub-scan.mjs", {
  "src/features/f.ts": 'export const f = () => {\n  throw new Error("not implemented");\n};\n',
}, { pass: false, matching: /banned marker/ });

expect("stub: mocking a first-party module fails", "stub-scan.mjs", {
  "src/features/f.test.ts": 'vi.mock("@/domain/note/repository");\n',
}, { pass: false, matching: /first-party/ });

expect("stub: pulling __fixtures__ into production code fails", "stub-scan.mjs", {
  "src/features/f.ts": 'import { makeNote } from "./__fixtures__/note";\nexport const f = () => makeNote();\n',
}, { pass: false, matching: /__fixtures__/ });

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

// --- dup:scan (the component half) -------------------------------------------
expect("dup: a feature composing proto-ui primitives passes", "component-dup-scan.mjs", {
  "src/features/notes/ui/Notes.tsx":
    'import { Button } from "@jj/proto-ui";\nexport const N = () => <Button data-testid="n">x</Button>;\n',
}, { pass: true });

expect("dup: a raw <button> in a feature fails", "component-dup-scan.mjs", {
  "src/features/notes/ui/Notes.tsx": 'export const N = () => <button data-testid="n">x</button>;\n',
}, { pass: false, matching: /raw <button>/ });

expect("dup: a raw element wearing a primitive role fails", "component-dup-scan.mjs", {
  "src/features/notes/ui/Notes.tsx": 'export const N = () => <div role="dialog" data-testid="n" />;\n',
}, { pass: false, matching: /primitive role/ });

// --- consistency -------------------------------------------------------------
const consistencyBase = (over = {}) => ({
  "src/i18n/config.ts": 'export const DEFAULT_LOCALE = "en" as const;\n',
  "packages/proto-ui/tokens.ts": "export const tokens = { color: {} } as const;\n",
  "src/config/env.ts": "const EnvSchema = z.object({});\nexport const env = EnvSchema.parse({});\n",
  ...over,
});

expect("consistency: one definition per single-source registry passes", "consistency.mjs", consistencyBase(), {
  pass: true,
});

expect("consistency: design tokens defined twice fails", "consistency.mjs", consistencyBase({
  "src/theme/tokens.ts": "export const tokens = { color: {} } as const;\n",
}), { pass: false, matching: /defined 2x/ });

expect("consistency: two accepted ADRs sharing a title fails", "consistency.mjs", consistencyBase({
  "docs/adr/010-a.md": adr("010", "accepted"),
  "docs/adr/011-b.md": adr("011", "accepted").replace("# ADR 011: A decision", "# ADR 011: A decision"),
}), { pass: false, matching: /duplicate accepted ADR title/ });

expect("consistency: a non-English script in code fails", "consistency.mjs", consistencyBase({
  "src/features/f.ts": 'export const label = "Привет";\n',
}), { pass: false, matching: /non-English/ });

// --- snapshot:diff -----------------------------------------------------------
// The passing case needs a seed.lock holding a hash only the gate can compute,
// so `prepare` writes the baseline the way an operator would.
const snapshotBase = (over = {}) => ({
  "package.json": { version: "0.1.0", scripts: { verify: "pnpm run lint && pnpm run test:unit" } },
  "packages/proto-ui/package.json": { name: "@jj/proto-ui", version: "0.1.0" },
  "packages/proto-ui/src/index.ts": 'export { Button } from "./Button";\n',
  "packages/proto-ui/src/Button.tsx": "export function Button() {\n  return null;\n}\n",
  "src/app/routes.ts": "export const routes = { home: '/' } as const;\n",
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
    package: "@jj/proto-ui",
    version: "0.1.0",
    sha256: "0000000000000000000000000000000000000000000000000000000000000000",
    vendoredAt: "packages/proto-ui",
  },
}), { pass: false, matching: /seed integrity/ });

expect("snapshot: a file added after the baseline fails", "snapshot-diff.mjs", snapshotBase(), {
  pass: false,
  matching: /fileTree drifted/,
  prepare: (dir) => {
    writeBaseline(dir);
    writeFileSync(join(dir, "src", "app", "unexpected.ts"), "export const x = 1;\n");
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

// --- budget ------------------------------------------------------------------
// Fixtures are generated, not literal: exceeding a 300 kB gzipped ceiling needs
// ~400 kB of incompressible bytes, which does not belong in source.
const writeDist = (dir, files) => {
  mkdirSync(join(dir, "dist", "assets"), { recursive: true });
  for (const [name, body] of Object.entries(files)) writeFileSync(join(dir, "dist", name), body);
};

expect("budget: a small production bundle passes", "budget.mjs", {}, {
  pass: true,
  prepare: (dir) => writeDist(dir, { "assets/app.js": "globalThis.app = 1;\n", "assets/app.css": "a{color:red}\n" }),
});

expect("budget: no dist fails rather than reporting zero", "budget.mjs", {}, {
  pass: false,
  matching: /no dist/,
});

expect("budget: refuses to measure a build containing the component catalogue", "budget.mjs", {}, {
  pass: false,
  matching: /never ships/,
  prepare: (dir) =>
    writeDist(dir, { "assets/app.js": "globalThis.app = 1;\n", "gallery.html": "<!doctype html>\n" }),
});

expect("budget: JS over the gzipped ceiling fails", "budget.mjs", {}, {
  pass: false,
  matching: /exceeds/,
  prepare: (dir) => writeDist(dir, { "assets/app.js": randomBytes(500_000).toString("base64") }),
});

// --- sec:scan ----------------------------------------------------------------
// Only the deterministic half is self-testable: that the secret scan cannot be
// silently skipped in CI. `pnpm audit` needs a registry, so its behaviour is
// asserted by CI running the real gate, not here — recorded in
// references/requirements.md §19 rather than papered over.
expect("security: the secret scan cannot be skipped in CI", "sec-scan.mjs", {}, {
  pass: false,
  matching: /mandatory/,
  env: { CI: "1", PATH: "" },
});

if (results.length) fail(`gates:selftest FAILED (${results.length})`, results);
ok("gates:selftest: every gate, guardrail and converter rejects what it claims to reject");

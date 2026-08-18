import { cpSync, existsSync, mkdtempSync, mkdirSync, readFileSync, utimesSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { execSync, spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { fail, ok } from "./lib.mjs";

// @adr 009 - the gates are the product, so the gates get tested
// A gate nobody has seen fail is a gate nobody knows works. This builds a throwaway
// project per case, breaks exactly one thing, and asserts the gate's exit code.
// Run it after touching any scan script: `pnpm gates:selftest`.

const SCRIPTS = resolve(dirname(new URL(import.meta.url).pathname));
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
  layer: { base: 0, raised: 10, sticky: 100, overlay: 1000 },
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
    <div style={{ position: "fixed", zIndex: tokens.layer.sticky }} />
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
export const P = () => <div style={{ position: "fixed", zIndex: tokens.layer.sticky }} />;`,
  ),
  { pass: false, matching: /without <Portal>/ },
);

expect(
  "layer: a scale that grows a per-kind overlay entry fails",
  "layer-scan.mjs",
  {
    "packages/proto-ui/tokens.ts":
      "export const tokens = {\n  layer: { base: 0, raised: 10, sticky: 100, overlay: 1000, modal: 1010 },\n} as const;\n",
  },
  { pass: false, matching: /is back/ },
);

// --- layer rules 4-9: the composition IS the guarantee -------------------------
const lib = (files) => ({ "packages/proto-ui/tokens.ts": TOKENS, ...files });

expect(
  "layer: a library surface without a slot fails (rule 4)",
  "layer-scan.mjs",
  lib({
    "packages/proto-ui/src/Thing.tsx":
      'import { promote } from "./overlay/index";\nexport const T = () => {\n  promote(document.body, { popover: true });\n  return null;\n};\n',
  }),
  { pass: false, matching: /without useOverlaySlot/ },
);

expect(
  "layer: a second document keydown listener in the library fails (rule 5)",
  "layer-scan.mjs",
  lib({
    "packages/proto-ui/src/Thing.tsx":
      'export const T = () => {\n  document.addEventListener("keydown", () => {});\n  return null;\n};\n',
  }),
  { pass: false, matching: /document keydown listener/ },
);

expect(
  "layer: reading the overlay base outside OverlayStack fails (rule 6)",
  "layer-scan.mjs",
  lib({
    "packages/proto-ui/src/Thing.tsx":
      'import { tokens } from "../tokens";\nexport const z = tokens.layer.overlay;\n',
  }),
  { pass: false, matching: /reads tokens\.layer\.overlay/ },
);

expect(
  "layer: a platform top-layer call outside the adapter fails (rule 9)",
  "layer-scan.mjs",
  lib({
    "packages/proto-ui/src/Thing.tsx":
      'export const show = (el: HTMLElement) => {\n  el.showPopover();\n};\n',
  }),
  { pass: false, matching: /calls \.showPopover/ },
);

expect(
  "layer: prose about showModal in a doc comment is not a call (rule 9)",
  "layer-scan.mjs",
  lib({
    "packages/proto-ui/src/Thing.tsx":
      '/** Documents `<dialog>.showModal()` without calling it. */\nexport const T = 1;\n',
  }),
  { pass: true },
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

// --- config: the delivery declaration, desktop edition -------------------------
// The pasted "credential" is deliberately low-entropy: the config gate rejects
// on SHAPE (not SCREAMING_SNAKE => not an env var name), and a high-entropy
// fixture would trip the tree's own secret scan — the counterexample must fail
// exactly one gate, the one under test.
expect(
  "config: a credential pasted into integrations tokenEnv fails",
  "config-cli.mjs",
  withConfig({
    integrations: { jira: { tokenEnv: "aaaa-bbbb-cccc-dddd" } },
  }),
  { pass: false, matching: /looks like a value, not an env var name/ },
);

// A desktop prototype has no promotion chain: an environments{} or deployment{}
// block is a web-template concept smuggled in, and config:check says so.
expect(
  "config: an environments block is not a desktop concept",
  "config-cli.mjs",
  withConfig({ environments: { dev: { enabled: true } } }),
  { pass: false, matching: /not a desktop concept/ },
);

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
  "hook: lowering the mutation-score floor is blocked",
  "guard-write.mjs",
  { tool_name: "Edit", tool_input: { file_path: "stryker.config.json", new_string: '"break": 40,' } },
  { ".proto-forge/config.json": {} },
  { blocked: true, matching: /mutation-score floor/ },
);

hook(
  "hook: narrowing the mutation scope is blocked",
  "guard-write.mjs",
  { tool_name: "Write", tool_input: { file_path: "stryker.config.json", content: '{ "mutate": ["src/one.ts"] }' } },
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

// --- ignore-registry ---------------------------------------------------------------
// The v8-ignore population is currently ZERO; this gate keeps it from eroding one
// "harmless" ignore at a time. An ignore must state a reason, name the harness case
// that covers the branch in a real browser, and change the pinned count in the
// snapshot -- a reviewed diff, never a drive-by.
const CASES_TS = 'export const cases = [\n  { id: "dialog-open", component: "Dialog", kind: "surface", state: "open", note: "x" },\n];\n';
const ignoreProject = (source, pinned) => ({
  "src/harness/cases.ts": CASES_TS,
  "src/features/f.ts": source,
  ".proto-forge/snapshot.json": { ignores: pinned },
});

expect("ignores: a clean tree with a matching pin passes", "ignore-registry.mjs",
  ignoreProject("export const f = () => 1;\n", 0), { pass: true });

expect("ignores: a well-formed, evidenced ignore with a matching pin passes", "ignore-registry.mjs",
  ignoreProject(
    "/* v8 ignore next -- jsdom has no top layer to promote into [covered-by: dialog-open] */\nexport const f = () => 1;\n",
    1,
  ), { pass: true });

expect("ignores: a bare ignore with no reason fails", "ignore-registry.mjs",
  ignoreProject("/* v8 ignore next */\nexport const f = () => 1;\n", 1),
  { pass: false, matching: /covered-by/ });

expect("ignores: a reasoned ignore naming no browser evidence fails", "ignore-registry.mjs",
  ignoreProject("/* v8 ignore next -- jsdom cannot reach this branch at all */\nexport const f = () => 1;\n", 1),
  { pass: false, matching: /covered-by/ });

expect("ignores: evidence that does not exist is not evidence", "ignore-registry.mjs",
  ignoreProject(
    "/* v8 ignore next -- jsdom has no top layer to promote into [covered-by: invented-case] */\nexport const f = () => 1;\n",
    1,
  ), { pass: false, matching: /does not declare/ });

expect("ignores: a population that grew past its pin fails", "ignore-registry.mjs",
  ignoreProject(
    "/* v8 ignore next -- jsdom has no top layer to promote into [covered-by: dialog-open] */\nexport const f = () => 1;\n",
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
// 100% is only meaningful while nobody lowers a threshold and nobody adds an
// exclusion. A hook blocks both locally; this gate is the same promise in CI.
const VITE = (thresholds, exclude) => `export default {
  test: {
    coverage: {
      exclude: [
${exclude}
      ],
      thresholds: {
${thresholds}
      },
    },
  },
};
`;
const GOOD_THRESHOLDS = '        "src/**": { statements: 100, branches: 100, functions: 100, lines: 100 },';
const GOOD_EXCLUDE = '        // tests and their fixtures are not product code\n        "**/*.test.*",';

expect("coverage: floors at 100 and reasoned exclusions pass", "coverage-policy.mjs", {
  "vite.config.ts": VITE(GOOD_THRESHOLDS, GOOD_EXCLUDE),
}, { pass: true });

expect("coverage: a lowered threshold fails", "coverage-policy.mjs", {
  "vite.config.ts": VITE('        "src/**": { statements: 100, branches: 85, functions: 100, lines: 100 },', GOOD_EXCLUDE),
}, { pass: false, matching: /branches threshold is 85/ });

expect("coverage: an exclusion outside the allow-list fails", "coverage-policy.mjs", {
  "vite.config.ts": VITE(GOOD_THRESHOLDS, GOOD_EXCLUDE + '\n        // convenient\n        "src/features/**",'),
}, { pass: false, matching: /not on the allow-list/ });

expect("coverage: an allow-listed exclusion without its reason fails", "coverage-policy.mjs", {
  "vite.config.ts": VITE(GOOD_THRESHOLDS, '        "**/*.test.*",'),
}, { pass: false, matching: /no reason comment/ });

// The tamper-guard must not be blinded by the tamper it guards against: a glob with a
// character class contains "]", and a scan anchored on the FIRST "]" would truncate
// there, letting every entry after it escape the allow-list unseen.
expect("coverage: a character-class glob cannot truncate the exclude scan", "coverage-policy.mjs", {
  "vite.config.ts": VITE(GOOD_THRESHOLDS, GOOD_EXCLUDE + '\n        // convenient\n        "src/[a-z]*/**",'),
}, { pass: false, matching: /"src\/\[a-z\]\*\/\*\*" is not on the allow-list/ });

// --- overlay:matrix ------------------------------------------------------------
// The no-gaps gate: component × (unit test, harness case, browser test, docs). Each
// cell has its own gate elsewhere; this is the one that asks per component, so a new
// primitive cannot ship with three cells full and one quietly empty.
const MATRIX_PROSE = "The Button primitive takes a variant and a required testid. ".repeat(5);
const matrixBase = (over = {}) => ({
  "packages/proto-ui/src/index.ts": 'export { Button } from "./Button";\n',
  "packages/proto-ui/src/Button.tsx": "export function Button() {\n  return null;\n}\n",
  "packages/proto-ui/src/Button.test.tsx": 'import { Button } from "./Button";\nit("renders", () => Button());\n',
  "src/harness/cases.ts":
    'export const cases = [\n  {\n    id: "button-variants",\n    component: "Button",\n    kind: "visual",\n    state: "variants",\n    note: "The variants.",\n  },\n];\n',
  "src/harness/mounts.tsx": 'export const mounts = {\n  "button-variants": () => null,\n};\n',
  "e2e/component-library.e2e.ts": 'import { cases } from "../src/harness/cases";\nexport const n = cases.length;\n',
  "docs/components/Button/README.md": `# Button\n\n${MATRIX_PROSE}\n\n![variants](./variants.png)\n`,
  ...over,
});

expect("matrix: a complete row passes", "overlay-matrix.mjs", matrixBase(), { pass: true });

expect("matrix: an exported component with no case fails as unclassified", "overlay-matrix.mjs", matrixBase({
  "src/harness/cases.ts": "export const cases = [];\n",
  "src/harness/mounts.tsx": "export const mounts = {};\n",
}), { pass: false, matching: /classify/ });

expect("matrix: a renderable case with no mount fails", "overlay-matrix.mjs", matrixBase({
  "src/harness/mounts.tsx": "export const mounts = {};\n",
}), { pass: false, matching: /no mount/ });

expect("matrix: a component no unit test exercises fails", "overlay-matrix.mjs", matrixBase({
  "packages/proto-ui/src/Button.test.tsx": 'it("tests something else entirely", () => {});\n',
}), { pass: false, matching: /unit test/ });

expect("matrix: a surface with no topmost case fails", "overlay-matrix.mjs", matrixBase({
  "src/harness/cases.ts":
    'export const cases = [\n  {\n    id: "button-variants",\n    component: "Button",\n    kind: "surface",\n    state: "open",\n    note: "A surface.",\n  },\n];\n',
}), { pass: false, matching: /topmost/ });

expect("matrix: an undocumented component fails", "overlay-matrix.mjs", matrixBase({
  "docs/components/Button/README.md": undefined,
}), { pass: false, matching: /not documented/ });

expect("matrix: a structural component with a mount fails", "overlay-matrix.mjs", matrixBase({
  "src/harness/cases.ts":
    'export const cases = [\n  {\n    id: "button-none",\n    component: "Button",\n    kind: "structural",\n    state: "none",\n    note: "Renders nothing.",\n  },\n];\n',
  "src/harness/mounts.tsx": 'export const mounts = {\n  "button-none": () => null,\n};\n',
  "docs/components/Button/README.md": `# Button\n\n${MATRIX_PROSE}\n\n<!-- no-screenshot: renders no markup of its own -->\n`,
}), { pass: false, matching: /picture of its child/ });

expect("matrix: a browser suite that stops reading the registry empties every cell", "overlay-matrix.mjs", matrixBase({
  "e2e/component-library.e2e.ts": 'export const n = 0;\n',
}), { pass: false, matching: /browser cell/ });

expect("matrix: a case for a component the library does not export fails", "overlay-matrix.mjs", matrixBase({
  "src/harness/cases.ts":
    'export const cases = [\n  {\n    id: "button-variants",\n    component: "Button",\n    kind: "visual",\n    state: "variants",\n    note: "The variants.",\n  },\n  {\n    id: "ghost-open",\n    component: "Ghost",\n    kind: "visual",\n    state: "open",\n    note: "Documents nothing real.",\n  },\n];\n',
}), { pass: false, matching: /does not export/ });

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

// --- BR-42: the page was written against a decision that still stands ----------
// The source hash cannot see an ADR edit — change the decision, leave the code, and
// every hash still matches while the page describes something nobody decided any
// more. These four pin both directions, including the one that must NOT fire:
// flipping a status is evidence moving, not the decision moving.
const ADR_BODY = "## Context\n\nOverlays need one stacking order.\n\n## Decision\n\nTop layer, ordered by open time.\n";
const decisionBase = (over = {}) => ({
  "packages/proto-ui/src/index.ts": 'export { Button } from "./Button";\n',
  "packages/proto-ui/src/Button.tsx": "// @adr 008 - the overlay stacking order\nexport function Button() {\n  return null;\n}\n",
  "docs/components/Button/README.md": `# Button\n\n${PROSE}\n\n<!-- no-screenshot: a headless primitive renders nothing of its own -->\n`,
  "docs/adr/008-overlay-layering.md": `# ADR 008\n\n- Status: accepted\n${ADR_BODY}`,
  ...over,
});
const digest = (s) => createHash("sha256").update(s).digest("hex");
// The gate hashes the ADR from its first `## ` heading down, leading newline included.
const CURRENT_008 = digest(`\n${ADR_BODY}`);

expect("docs: a subject written against the current decision passes", "docs-verify.mjs", decisionBase({
  "docs/components/Button/.shot.lock": { source: "unused-here", adrs: { "008": CURRENT_008 } },
}), { pass: true });

expect("docs: a subject written against an older decision fails", "docs-verify.mjs", decisionBase({
  "docs/components/Button/.shot.lock": { source: "unused-here", adrs: { "008": digest("\n## Decision\n\nSomething else entirely.\n") } },
}), { pass: false, matching: /older ADR 008/ });

expect("docs: a subject implementing a decision with no lock at all fails", "docs-verify.mjs", decisionBase(), {
  pass: false,
  matching: /which version of that decision/,
});

expect("docs: flipping an ADR's status does not stale the subject", "docs-verify.mjs", decisionBase({
  "docs/adr/008-overlay-layering.md": `# ADR 008\n\n- Status: proposed\n- Prompt-log: .prompts/0004-overlays.md\n${ADR_BODY}`,
  "docs/components/Button/.shot.lock": { source: "unused-here", adrs: { "008": CURRENT_008 } },
}), { pass: true });


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

expect("stub: a fixture built with defineFactory passes", "stub-scan.mjs", {
  "src/domain/note/__fixtures__/note.ts":
    'import { z } from "zod";\nimport { defineFactory } from "../../../test/factory";\n' +
    'export const NoteSchema = z.object({ id: z.string() });\n' +
    'export const makeNote = defineFactory(NoteSchema, (seq) => ({ id: String(seq) }));\n' +
    'export type Note = z.output<typeof NoteSchema>;\n',
}, { pass: true });

expect("stub: a fixture exporting a bare literal fails", "stub-scan.mjs", {
  "src/domain/note/__fixtures__/note.ts":
    'export const notes = [{ id: "1", text: "hand-written" }];\n',
}, { pass: false, matching: /defineFactory/ });

// BR-08/BR-02 have no eslint-disable escape hatch: a disable comment for a gated rule
// is a shortcut marker, exactly like TODO.
expect("stub: disabling a gated lint rule inline fails", "stub-scan.mjs", {
  "src/features/f.ts": '// eslint-disable-next-line i18next/no-literal-string\nexport const f = () => "Save";\n',
}, { pass: false, matching: /no escape hatch/ });

expect("stub: a disable for an ungated rule is not this gate's business", "stub-scan.mjs", {
  "src/features/f.ts": "// eslint-disable-next-line max-params\nexport const f = () => 1;\n",
}, { pass: true });

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
const MSG_OK = "feat: accept the note domain decision\n\nADR: 010\nPrompt-Log: .prompts/0001-x.md\n";

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

// The CSS mirror. The overlay stylesheet has to exist, which puts design values in two
// languages; these three cases are what keeps them one source.
const TOKENS_WITH_COLOR = `export const tokens = {
  color: { bg: "#ffffff", scrim: "rgba(0, 0, 0, 0.5)", primaryFg: "#ffffff" },
  radius: { md: "8px" },
  focusRing: "0 0 0 3px rgba(29, 78, 216, 0.5)",
} as const;
`;

expect("consistency: a stylesheet using only token vars passes", "consistency.mjs", consistencyBase({
  "packages/proto-ui/tokens.ts": TOKENS_WITH_COLOR,
  "packages/proto-ui/src/overlay/overlay.css":
    "dialog::backdrop { background: var(--pf-color-scrim); }\n" +
    "dialog[open] { background: var(--pf-color-bg); border-radius: var(--pf-radius-md); }\n",
}), { pass: true });

expect("consistency: a stylesheet var no token produces fails", "consistency.mjs", consistencyBase({
  "packages/proto-ui/tokens.ts": TOKENS_WITH_COLOR,
  "packages/proto-ui/src/overlay/overlay.css": "dialog::backdrop { background: var(--pf-color-invented); }\n",
}), { pass: false, matching: /does not produce/ });

expect("consistency: a literal colour in the stylesheet fails", "consistency.mjs", consistencyBase({
  "packages/proto-ui/tokens.ts": TOKENS_WITH_COLOR,
  "packages/proto-ui/src/overlay/overlay.css": "dialog::backdrop { background: #00000080; }\n",
}), { pass: false, matching: /literal design value/ });

expect("consistency: a camelCase token resolves to its kebab-case custom property", "consistency.mjs", consistencyBase({
  "packages/proto-ui/tokens.ts": TOKENS_WITH_COLOR,
  // primaryFg -> --pf-color-primary-fg, and the top-level scalar focusRing -> --pf-focus-ring.
  "packages/proto-ui/src/overlay/overlay.css":
    "dialog[open] { color: var(--pf-color-primary-fg); box-shadow: var(--pf-focus-ring); }\n",
}), { pass: true });

// BR-12's dead-weight corollary: a runtime dependency nothing imports ships attack
// surface for no behaviour. Scoped to `dependencies` — devDependencies are wired
// through configs and CLIs, where "is it used?" has no cheap mechanical answer.
expect("consistency: a runtime dependency nothing imports fails", "consistency.mjs", consistencyBase({
  "package.json": { dependencies: { "left-pad": "^1.3.0" } },
}), { pass: false, matching: /"left-pad" is imported by nothing/ });

expect("consistency: an imported runtime dependency passes", "consistency.mjs", consistencyBase({
  "package.json": { dependencies: { zod: "^3.25.0" } },
  "src/features/uses.ts": 'import { z } from "zod";\nexport const S = z.string();\n',
}), { pass: true });

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
    writeDist(dir, { "assets/app.js": "globalThis.app = 1;\n", "harness.html": "<!doctype html>\n" }),
});

expect("budget: JS over the gzipped ceiling fails", "budget.mjs", {}, {
  pass: false,
  matching: /exceeds/,
  prepare: (dir) => writeDist(dir, { "assets/app.js": randomBytes(500_000).toString("base64") }),
});

// --- status: the documented numbers are the measured numbers --------------------
// BR-36. quality:report distils the tiers' machine outputs into quality.json and
// regenerates the STATUS.md block; status:verify re-derives both and holds the
// config mirrors to their sources. The fixtures fabricate the machine outputs the
// reporters would have written, run the producer, then break exactly one copy.
const MUTANTS = (killed, survived) => ({
  files: {
    "src/a.ts": {
      mutants: [
        ...Array.from({ length: killed }, () => ({ status: "Killed" })),
        ...Array.from({ length: survived }, () => ({ status: "Survived" })),
      ],
    },
  },
});
const statusProject = (over = {}) => ({
  ".proto-forge/config.json": {},
  "package.json": { scripts: { verify: "pnpm run test:unit && pnpm run status:verify" } },
  "vite.config.ts": VITE(GOOD_THRESHOLDS, GOOD_EXCLUDE),
  "stryker.config.json": { thresholds: { high: 95, low: 90, break: 90 } },
  "coverage/coverage-summary.json": {
    total: { statements: { pct: 100 }, branches: { pct: 100 }, functions: { pct: 100 }, lines: { pct: 100 } },
  },
  "coverage/test-results.json": { testResults: [{}, {}], numTotalTests: 5, numPassedTests: 5 },
  "reports/mutation/mutation.json": MUTANTS(9, 1),
  "test-results/e2e-results.json": { stats: { expected: 3, unexpected: 0, flaky: 0, skipped: 0 } },
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
    writeFileSync(
      join(dir, "stryker.config.json"),
      JSON.stringify({ thresholds: { high: 95, low: 90, break: 80 } }, null, 2),
    );
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
// the engines fixture matches the running node so the clean case passes anywhere.
const doctorBase = (over = {}) => ({
  "package.json": { engines: { node: `>=${process.versions.node.split(".")[0]}` } },
  ...over,
});
const noPorts = { PROTO_FORGE_DOCTOR_PORTS: "" };

expect("doctor: a clean tree passes", "doctor.mjs", doctorBase(), { pass: true, env: noPorts });

expect(
  "doctor: a stale mutation cache is named with its fix",
  "doctor.mjs",
  doctorBase({ ".stryker-tmp/incremental.json": "{}", "src/a.ts": "export const a = 1;\n" }),
  {
    pass: false,
    matching: /rm -rf \.stryker-tmp/,
    env: noPorts,
    // The cache predates the source by construction: epoch mtime, no clock math.
    prepare: (dir) => utimesSync(join(dir, ".stryker-tmp", "incremental.json"), new Date(0), new Date(0)),
  },
);

expect(
  "doctor: a missing env file is named with its fix",
  "doctor.mjs",
  doctorBase({ ".env.example": "VITE_APP_BASE_URL=\n" }),
  { pass: false, matching: /cp \.env\.example \.env/, env: noPorts },
);

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

// --- shell:verify ---------------------------------------------------------------
// BR-37: the shell's security posture is configuration under a gate. Fixtures
// mirror the SHIPPED shell sources (read from this template at selftest time,
// so the passing case proves the real files), then break exactly one thing.
// The gate is fully static — no electron binary is involved (NFR-16).
const SHELL_ROOT = join(SCRIPTS, "..");
const SHELL_MAIN = readFileSync(join(SHELL_ROOT, "src-electron", "main.ts"), "utf8");
const SHELL_PRELOAD = readFileSync(join(SHELL_ROOT, "src-electron", "preload.ts"), "utf8");
const SHELL_BUILDER = readFileSync(join(SHELL_ROOT, "electron-builder.yml"), "utf8");
const realShellPkg = JSON.parse(readFileSync(join(SHELL_ROOT, "package.json"), "utf8"));
const SHELL_PKG = JSON.stringify({
  main: realShellPkg.main,
  devDependencies: {
    electron: realShellPkg.devDependencies.electron,
    "electron-builder": realShellPkg.devDependencies["electron-builder"],
  },
});
const shellBase = (over = {}) => ({
  ".proto-forge/config.json": {},
  "package.json": SHELL_PKG,
  "src-electron/main.ts": SHELL_MAIN,
  "src-electron/preload.ts": SHELL_PRELOAD,
  "electron-builder.yml": SHELL_BUILDER,
  ...over,
});

expect("shell: the shipped shell configuration passes", "shell-verify.mjs", shellBase(), { pass: true });

expect(
  "shell: a disabled isolation flag fails",
  "shell-verify.mjs",
  shellBase({
    "src-electron/main.ts": SHELL_MAIN.replace("contextIsolation: true", "contextIsolation: false"),
  }),
  { pass: false, matching: /contextIsolation/ },
);

expect(
  "shell: a missing CSP fails",
  "shell-verify.mjs",
  shellBase({
    "src-electron/main.ts": SHELL_MAIN.replace("default-src 'self'; script-src 'self'; ", ""),
  }),
  { pass: false, matching: /CSP/ },
);

expect(
  "shell: an unpinned shell dependency fails",
  "shell-verify.mjs",
  shellBase({
    "package.json": SHELL_PKG.replace('"electron":"', '"electron":"^'),
  }),
  { pass: false, matching: /not pinned exact/ },
);

// Beyond the named quartet: the two doors a desktop update channel opens.
expect(
  "shell: a dynamic isolation value fails",
  "shell-verify.mjs",
  shellBase({
    "src-electron/main.ts": SHELL_MAIN.replace("sandbox: true", "sandbox: unsafeFlagFromSomewhere"),
  }),
  { pass: false, matching: /sandbox/ },
);

expect(
  "shell: a bare window assignment in the preload fails",
  "shell-verify.mjs",
  shellBase({
    "src-electron/preload.ts": SHELL_PRELOAD + '\nconst w = window as unknown as { api: number };\nwindow.leaked = w.api;\n',
  }),
  { pass: false, matching: /contextBridge/ },
);

expect(
  "shell: an enabled publish feed fails",
  "shell-verify.mjs",
  shellBase({
    "electron-builder.yml": SHELL_BUILDER.replace("publish: null", "publish:\n  provider: github"),
  }),
  { pass: false, matching: /publish/ },
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
ok("gates:selftest: every gate, guardrail and converter rejects what it claims to reject");

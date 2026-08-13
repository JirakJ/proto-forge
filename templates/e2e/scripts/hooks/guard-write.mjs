import { existsSync } from "node:fs";
import { allow, block, guardrails, hookInput, matchesGlob, relative } from "./hook-lib.mjs";

// PreToolUse(Write|Edit). Two things an agent must not do on its own:
//   1. touch a protected path — the byte-pinned gate corpus (which includes the
//      shared contract validator), the locks, the append-only log
//   2. lower a quality floor — a gate mode in the config, a lint rule switched off
// Both are recoverable mistakes that are very hard to spot in review, because the
// diff looks small and every gate goes green afterwards. That is exactly the shape
// of change worth stopping before it lands.

const input = await hookInput();
const file = relative(input.tool_input?.file_path, input.cwd);
if (file === "") allow();

const rails = guardrails();

// --- 1. protected paths ------------------------------------------------------
// scripts/** is this template's byte-pinned seed: the gate corpus AND the
// contract validator the suites trust live there.
const SEED = "scripts/**";
const protectedPaths = rails.protectedPaths ?? [];
const hit = protectedPaths.find((p) => matchesGlob(p, file));

if (hit !== undefined) {
  // The seed is hashed as a tree: adding a file changes it as surely as editing one.
  if (matchesGlob(SEED, file)) {
    block(`${file} is part of the byte-pinned gate corpus`, [
      "Its sha256 is recorded in .proto-forge/seed.lock and re-verified by snapshot:diff.",
      "A legitimate upgrade is a deliberate act: record it in an ADR, then run `pnpm seed:lock`.",
      "Loosening the contract validator to make a red run green is the exact move this hook exists to stop.",
    ]);
  }
  const exists = existsSync(file);
  if (input.tool_name === "Edit" || exists) {
    block(`${file} matches the protected pattern "${hit}"`, [
      exists ? "It already exists, and this change would rewrite history rather than add to it." : "",
      ".prompts/** is append-only: corrections are new entries referencing the prior id.",
      "Locks and snapshots are generated — run `pnpm snapshot` or `pnpm seed:lock`, do not hand-edit.",
    ].filter(Boolean));
  }
}

// --- 2. quality floors -------------------------------------------------------
if (rails.freezeThresholds === false || process.env.PROTO_FORGE_ALLOW_THRESHOLD_EDIT === "1") allow();

const FLOOR_FILES = ["eslint.config.js", ".proto-forge/config.json"];
if (!FLOOR_FILES.includes(file)) allow();

// Write replaces the whole file, so there is no incoming fragment to inspect.
const incoming = input.tool_name === "Write" ? (input.tool_input?.content ?? "") : (input.tool_input?.new_string ?? "");

const SUSPECT = [
  [/"mode"\s*:\s*"(warn|off)"/, 'a gate mode below "error"'],
  [/:\s*"off"/, "a lint rule being switched off"],
];

const found = SUSPECT.find(([re]) => re.test(incoming));
if (found !== undefined) {
  block(`this edit to ${file} changes ${found[1]}`, [
    "Quality floors move by decision, not by convenience: a failing gate is remediated by fixing the code.",
    "If the floor itself is genuinely wrong, record an ADR and — for a mandatory gate — add a waivers[] entry",
    "with a reason, that ADR and an expiry date, so the relaxation is visible and ends by itself.",
    "Deliberate one-off override: PROTO_FORGE_ALLOW_THRESHOLD_EDIT=1",
  ]);
}

allow();

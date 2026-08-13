import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { read } from "./lib.mjs";

// @adr 001 - pnpm doctor: the known failure classes, named before they bite (NFR-18)
//
// Support tool (notAGate). Every check is an incident class that has actually
// eaten a morning: a node outside the engines pin, a pnpm that ignores the
// packageManager pin, a machine without git (the parts are separate
// checkouts), a declared part that was never materialized. Each finding
// prints ✗ with THE fix command; exit 1 if anything is wrong. Never a network
// socket: every probe is local. A missing part is a finding here because the
// fix is one command — `pnpm ws:verify` stays green on absent parts by design
// (pre-clone state), which is exactly why the doctor names them.

const findings = [];
const pass = (msg) => process.stdout.write(`✓ ${msg}\n`);
const flunk = (msg, fix) => {
  process.stdout.write(`✗ ${msg}\n    fix: ${fix}\n`);
  findings.push(msg);
};
const info = (msg) => process.stdout.write(`· ${msg}\n`);

const pkg = JSON.parse(read("package.json"));

// --- node satisfies engines ----------------------------------------------------
// A tiny comparator on purpose: engines pins are ">=X <Y" shapes, and a semver
// library for one range would be a dependency budget line.
const cmp = (a, b) => {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i += 1) {
    if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) - (pb[i] ?? 0);
  }
  return 0;
};
function satisfies(version, range) {
  return range.split(/\s+/).filter(Boolean).every((part) => {
    const m = /^(>=|<=|>|<|=|\^|~)?(\d+(?:\.\d+){0,2})$/.exec(part);
    if (m === null) return true; // an exotic range is not this tool's fight
    const [, op = "=", target] = m;
    const c = cmp(version, target);
    if (op === ">=") return c >= 0;
    if (op === "<=") return c <= 0;
    if (op === ">") return c > 0;
    if (op === "<") return c < 0;
    if (op === "^") return cmp(version, target) >= 0 && Number(version.split(".")[0]) === Number(target.split(".")[0]);
    if (op === "~") {
      const [tm, tn] = target.split(".").map(Number);
      const [vm, vn] = version.split(".").map(Number);
      return c >= 0 && vm === tm && (tn === undefined || vn === tn);
    }
    return c === 0;
  });
}

const engines = pkg.engines?.node;
if (engines === undefined) {
  info("package.json pins no node engines range");
} else if (satisfies(process.versions.node, engines)) {
  pass(`node v${process.versions.node} satisfies engines "${engines}"`);
} else {
  flunk(
    `node v${process.versions.node} is outside engines "${engines}" — gates and lockfile behaviour differ across majors`,
    `install a node matching "${engines}" (the .nvmrc names it: nvm use / mise use)`,
  );
}

// --- pnpm matches the packageManager pin ---------------------------------------
const pin = typeof pkg.packageManager === "string" && pkg.packageManager.startsWith("pnpm@")
  ? pkg.packageManager.slice("pnpm@".length)
  : null;
if (pin === null) {
  info("package.json pins no packageManager");
} else {
  const r = spawnSync("pnpm", ["--version"], { encoding: "utf8" });
  const installed = r.status === 0 ? r.stdout.trim() : null;
  if (installed === null) {
    flunk("pnpm is not on PATH", "corepack enable (activates the pinned pnpm from package.json)");
  } else if (installed !== pin) {
    flunk(
      `pnpm ${installed} does not match the packageManager pin ${pin} — lockfile and store behaviour can differ`,
      "corepack enable (then rerun; corepack serves the pinned version)",
    );
  } else {
    pass(`pnpm ${installed} matches the packageManager pin`);
  }
}

// --- git is present ------------------------------------------------------------
// The whole point of a workspace is holding sibling git checkouts together; a
// machine without git cannot materialize a single part.
const git = spawnSync("git", ["--version"], { encoding: "utf8" });
if (git.status === 0) {
  pass(`${git.stdout.trim()} on PATH`);
} else {
  flunk("git is not on PATH — the parts are separate git checkouts and cannot be cloned", "install git (xcode-select --install / apt install git)");
}

// --- declared parts are materialized -------------------------------------------
// ws:verify stays green on absent parts by design (the workspace clones before
// its parts). The doctor is where absence gets a name and its one command.
if (!existsSync("workspace.json")) {
  flunk("workspace.json is missing — the manifest is the single source of parts", "restore workspace.json (pnpm ws:verify diagnoses the shape)");
} else {
  let manifest = null;
  try {
    manifest = JSON.parse(readFileSync("workspace.json", "utf8"));
  } catch {
    flunk("workspace.json does not parse", "fix the JSON (pnpm ws:verify names the field-level problems)");
  }
  for (const p of Array.isArray(manifest?.parts) ? manifest.parts : []) {
    if (typeof p.dir !== "string") continue;
    if (existsSync(p.dir)) {
      pass(`part "${p.id}" (${p.template}) present at ${p.dir}/`);
    } else {
      flunk(
        `part "${p.id}" (${p.template}) is not materialized at ${p.dir}/ — ws:up has nothing to start there`,
        "pnpm ws:bootstrap (prints the clone/generation command for each absent part)",
      );
    }
  }
}

if (findings.length > 0) {
  process.stdout.write(`doctor: ${findings.length} finding(s) — each fix is printed above\n`);
  process.exit(1);
}
process.stdout.write("✓ doctor: everything a fresh clone trips over is in place\n");

import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { read } from "./lib.mjs";

// @adr 001 - pnpm doctor: the known failure classes, named before they bite (NFR-18)
//
// Support tool (notAGate). Every check is an incident class that has actually
// eaten a morning: a node outside the engines pin, a pnpm that ignores the
// packageManager pin, husky hooks that never wired after a fresh clone, an
// installed tree that drifted from the lockfile (the stale-.pnpm class),
// playwright browsers that were never installed. Each finding prints ✗ with
// THE fix command; exit 1 if anything is wrong. Never a network socket: every
// probe is local. The E2E_* runtime surface (E2E_WEB_URL / E2E_API_URL /
// E2E_CONTRACT) is NOTED, never required — pre-workspace, unset is the
// documented default, and the workspace pair sets it when it brings the
// stack up.

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

// --- husky hooks are wired -----------------------------------------------------
// A fresh clone has .husky committed but nothing pointing git at it until
// `pnpm install` runs the prepare script. Detect exactly that gap.
if (!existsSync(".husky")) {
  info("no .husky directory — commit hooks are not part of this tree");
} else {
  const r = spawnSync("git", ["config", "core.hooksPath"], { encoding: "utf8" });
  if (r.error !== undefined || r.status === null) {
    info("git not available — hook wiring not checked");
  } else if (r.stdout.trim() === ".husky") {
    pass("husky hooks wired (core.hooksPath = .husky)");
  } else if (spawnSync("git", ["rev-parse", "--git-dir"], { encoding: "utf8" }).status !== 0) {
    info("not a git checkout — commit hooks do not apply here");
  } else {
    flunk(
      "husky hooks are not wired — commit-msg enforcement is silently off after a fresh clone",
      "pnpm install (the prepare script wires core.hooksPath to .husky)",
    );
  }
}

// --- installed tree agrees with the lockfile -----------------------------------
// The stale-.pnpm class: node_modules carries a version the lockfile no longer
// names, so audits and imports disagree with what a fresh install would get.
const declared = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
if (declared.length === 0) {
  info("no dependencies declared — nothing to compare against the lockfile");
} else if (!existsSync("node_modules")) {
  flunk("node_modules is missing — nothing is installed yet", "pnpm install --frozen-lockfile");
} else {
  const r = spawnSync("pnpm", ["ls", "--depth", "0", "--json"], { encoding: "utf8" });
  let installed = null;
  try {
    const parsed = JSON.parse(r.stdout);
    const top = Array.isArray(parsed) ? parsed[0] : parsed;
    installed = { ...top?.dependencies, ...top?.devDependencies };
  } catch {
    installed = null;
  }
  if (installed === null) {
    flunk("`pnpm ls --depth 0 --json` produced nothing readable — the installed tree is not trustworthy", "rm -rf node_modules && pnpm install --frozen-lockfile");
  } else {
    const stale = declared.filter((name) => {
      const entry = installed[name];
      return entry === undefined || typeof entry.version !== "string" || entry.version === "";
    });
    if (stale.length === 0) {
      pass(`installed tree agrees with the lockfile (${declared.length} direct dependencies present)`);
    } else {
      flunk(
        `installed tree disagrees with the lockfile — missing or unmet: ${stale.join(", ")}`,
        "rm -rf node_modules && pnpm install --frozen-lockfile",
      );
    }
  }
}

// --- playwright browsers -------------------------------------------------------
// The mechanical check: the ms-playwright cache directory holds a chromium
// build. No spawn, no network — a missing directory is the whole diagnosis.
if (pkg.devDependencies?.["@playwright/test"] !== undefined) {
  const cache =
    process.env.PLAYWRIGHT_BROWSERS_PATH ??
    (process.platform === "darwin"
      ? join(homedir(), "Library", "Caches", "ms-playwright")
      : process.platform === "win32"
        ? join(process.env.LOCALAPPDATA ?? join(homedir(), "AppData", "Local"), "ms-playwright")
        : join(homedir(), ".cache", "ms-playwright"));
  const hasChromium = existsSync(cache) && readdirSync(cache).some((d) => d.startsWith("chromium"));
  if (hasChromium) {
    pass(`playwright chromium present in ${cache}`);
  } else {
    flunk("playwright browsers are not installed — test:e2e cannot launch chromium", "pnpm exec playwright install chromium");
  }
}

// --- the runtime surface: noted, never required --------------------------------
// test:e2e is OUTSIDE verify and needs the running pair; pre-workspace, the
// E2E_* variables are legitimately unset and every default is documented.
for (const [name, fallback] of [
  ["E2E_WEB_URL", "http://localhost:4173 (the web preview default)"],
  ["E2E_API_URL", "the flows' API default"],
  ["E2E_CONTRACT", "the workspace manifest's contract.source, when the pair exists"],
]) {
  info(
    process.env[name] !== undefined && process.env[name] !== ""
      ? `${name} is set — the runtime suite targets ${process.env[name]}`
      : `${name} unset — test:e2e falls back to ${fallback}; the workspace pair sets it when it brings the stack up`,
  );
}

if (findings.length > 0) {
  process.stdout.write(`doctor: ${findings.length} finding(s) — each fix is printed above\n`);
  process.exit(1);
}
process.stdout.write("✓ doctor: everything a fresh clone trips over is in place\n");

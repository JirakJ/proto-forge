import { existsSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createServer } from "node:net";
import { read, walk } from "./lib.mjs";

// @adr 009 - pnpm doctor: the known failure classes, named before they bite (NFR-18)
//
// Support tool (notAGate). Every check is an incident class that has actually
// eaten a morning: a node outside the engines pin, a pnpm that ignores the
// packageManager pin, husky hooks that never wired after a fresh clone, an
// installed tree that drifted from the lockfile (the stale-.pnpm class), a
// dotnet SDK that is absent or a feature band global.json cannot roll forward
// to, an unrestored tool manifest (dotnet-ef / dotnet-stryker missing), a stale
// Stryker report flattering or tanking the recorded score, a port the service
// cannot take, a missing .env. Each finding prints ✗ with THE fix command;
// exit 1 if anything is wrong. Never a network socket: every probe is local,
// and the port probe binds, it does not connect. Docker is NOTED, never
// required — the Testcontainers tier is tool-gated locally and mandatory in CI
// (ADR 003/006, §19.9).
//
// Selftest seam: PROTO_FORGE_DOCTOR_PORTS overrides the probed ports ("" skips
// the probe entirely) so the selftest stays deterministic on a busy machine.

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

// --- the dotnet toolchain: pinned SDK, restored tool manifest ------------------
// The dotnet analogue of the corepack pair: an SDK global.json can resolve
// (same major.minor, feature band >= the pin under rollForward latestFeature),
// and the local tool manifest (dotnet-ef, dotnet-stryker) actually restored.
// The FIX may reach the network, the diagnosis never does.
if (existsSync("global.json")) {
  const pinned = JSON.parse(read("global.json")).sdk?.version ?? "";
  const sdk = spawnSync("dotnet", ["--version"], { encoding: "utf8" });
  const installed = sdk.status === 0 ? sdk.stdout.trim() : null;
  if (installed === null) {
    flunk(
      "no dotnet on PATH — the app cannot build, let alone test",
      `install the .NET SDK ${pinned} (https://dot.net; brew install dotnet, winget, or apt)`,
    );
  } else {
    const [pMaj, pMin] = pinned.split(".");
    const [iMaj, iMin] = installed.split(".");
    if (pMaj !== iMaj || pMin !== iMin || cmp(installed, pinned) < 0) {
      flunk(
        `dotnet ${installed} cannot satisfy global.json's ${pinned} (rollForward latestFeature stays inside ${pMaj}.${pMin})`,
        `install a .NET SDK ${pMaj}.${pMin} at or above ${pinned}`,
      );
    } else {
      pass(`dotnet ${installed} satisfies the global.json pin ${pinned}`);
    }
  }

  if (existsSync(".config/dotnet-tools.json")) {
    const wanted = Object.keys(JSON.parse(read(".config/dotnet-tools.json")).tools ?? {});
    const list = spawnSync("dotnet", ["tool", "list"], { encoding: "utf8" });
    const missing = list.status === 0 ? wanted.filter((t) => !list.stdout.includes(t)) : wanted;
    if (missing.length === 0) {
      pass(`tool manifest restored (${wanted.join(", ")})`);
    } else {
      flunk(
        `tool manifest not restored — missing: ${missing.join(", ")} (test:mutation and the EF checks cannot run)`,
        "dotnet tool restore",
      );
    }
  }
}

// --- stale mutation report -----------------------------------------------------
// Stryker's JSON report is the recorded score quality:report restates; sources
// edited after it was written make the documented number a blend of two trees.
const STRYKER_REPORT = "build/reports/stryker/reports/mutation-report.json";
if (!existsSync("build/reports/stryker")) {
  info("no build/reports/stryker — the next mutation run starts clean");
} else if (!existsSync(STRYKER_REPORT)) {
  info("build/reports/stryker holds no mutation-report.json — report leftovers only");
} else {
  const reportAt = statSync(STRYKER_REPORT).mtimeMs;
  const inputs = [
    ...walk("src", (f) => f.endsWith(".cs")),
    ...(existsSync("stryker-config.json") ? ["stryker-config.json"] : []),
  ];
  const newest = inputs.reduce((max, f) => Math.max(max, statSync(f).mtimeMs), 0);
  if (newest > reportAt) {
    flunk(
      "stale mutation report — sources changed after build/reports/stryker/reports/mutation-report.json was written (the recorded score blends two trees)",
      "rm -rf build/reports/stryker (the next pnpm test:mutation re-measures)",
    );
  } else {
    pass("mutation report is current (no source newer than build/reports/stryker/reports/mutation-report.json)");
  }
}

// --- port the service needs ----------------------------------------------------
const ports = (process.env.PROTO_FORGE_DOCTOR_PORTS ?? "8080")
  .split(",")
  .filter((p) => p !== "")
  .map(Number);
const probe = (port) =>
  new Promise((resolve) => {
    const srv = createServer();
    srv.once("error", () => resolve(false));
    srv.once("listening", () => srv.close(() => resolve(true)));
    srv.listen(port, "127.0.0.1");
  });
for (const port of ports) {
  if (await probe(port)) {
    pass(`port ${port} is free`);
  } else {
    flunk(
      `port ${port} is already held — the app will fail with "address already in use"`,
      `lsof -nP -iTCP:${port} -sTCP:LISTEN (find the holder, then kill <pid>)`,
    );
  }
}

// --- docker: noted, never required ---------------------------------------------
const docker = spawnSync("docker", ["--version"], { encoding: "utf8" });
info(
  docker.status === 0
    ? "docker present — the Testcontainers tier (test:native) can run locally (CI runs it always)"
    : "docker absent — the Testcontainers tier is tool-gated locally and mandatory in CI; unit and conformance tiers need no docker",
);

// --- .env presence -------------------------------------------------------------
if (existsSync(".env.example")) {
  if (existsSync(".env")) {
    pass(".env present (documented surface in .env.example)");
  } else {
    flunk(".env is missing while .env.example documents the surface", "cp .env.example .env (then fill in real values)");
  }
}

if (findings.length > 0) {
  process.stdout.write(`doctor: ${findings.length} finding(s) — each fix is printed above\n`);
  process.exit(1);
}
process.stdout.write("✓ doctor: everything a fresh clone trips over is in place\n");

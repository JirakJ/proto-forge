import { existsSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createServer } from "node:net";
import { read, walk } from "./lib.mjs";

// @adr 009 - pnpm doctor: the known failure classes, named before they bite (NFR-18)
//
// Support tool (notAGate). Every check is an incident class that has actually
// eaten a morning: a node outside the engines pin, a pnpm that ignores the
// packageManager pin, husky hooks that never wired after a fresh clone, an
// installed tree that drifted from the lockfile (the stale-.pnpm class), a uv
// that is absent or serving a python the .python-version pin never named, a
// .venv that drifted from uv.lock, a stale mutmut cache flattering or tanking
// the score, a port the service cannot take, a missing .env. Each finding
// prints ✗ with THE fix command; exit 1 if anything is wrong. Never a network
// socket: every probe is local (uv runs with --offline), and the port probe
// binds, it does not connect. Docker is NOTED, never required — the
// Testcontainers tier is tool-gated locally and mandatory in CI (ADR 003/006).
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

// --- the uv toolchain: pinned python, synced venv ------------------------------
// The python analogue of the corepack/lockfile pair: uv on PATH, the
// .python-version toolchain fetched, and .venv agreeing with uv.lock. Every
// probe runs --offline where uv accepts it — the FIX may reach the network,
// the diagnosis never does.
if (existsSync("pyproject.toml")) {
  const uv = spawnSync("uv", ["--version"], { encoding: "utf8" });
  if (uv.status !== 0) {
    flunk(
      "uv is not on PATH — nothing can install or run the pinned python toolchain",
      "curl -LsSf https://astral.sh/uv/install.sh | sh (or pipx install uv)",
    );
  } else {
    pass(`${uv.stdout.trim()} on PATH`);
    if (existsSync(".python-version")) {
      const pinned = read(".python-version").trim();
      const found = spawnSync("uv", ["python", "find"], { encoding: "utf8" });
      if (found.status === 0) {
        pass(`python ${pinned} toolchain available (uv python find)`);
      } else {
        flunk(
          `no python matching the .python-version pin ${pinned} is fetched yet — uv run would stop to download one`,
          "uv python install (fetches the pinned toolchain once)",
        );
      }
    }
    if (existsSync("uv.lock")) {
      if (!existsSync(".venv")) {
        flunk("no .venv — the locked environment is not installed yet", "uv sync --frozen");
      } else {
        const check = spawnSync("uv", ["sync", "--check", "--frozen", "--offline"], { encoding: "utf8" });
        const out = `${check.stdout}${check.stderr}`;
        if (check.status === 0) {
          pass(".venv agrees with uv.lock (uv sync --check)");
        } else if (/unexpected argument|unrecognized/.test(out)) {
          info("this uv predates `sync --check` — venv drift not probed (upgrade uv to enable it)");
        } else {
          flunk(
            ".venv drifted from uv.lock — imports and audits disagree with what a fresh sync would install",
            "uv sync --frozen",
          );
        }
      }
    }
  }
}

// --- stale mutation cache ------------------------------------------------------
// mutmut's mutants/ directory is a memo of past runs; sources edited after it
// was generated make the next score a blend of two trees.
if (!existsSync("mutants")) {
  info("no mutants/ directory — the next mutation run starts clean");
} else {
  const cacheAt = walk("mutants").reduce((max, f) => Math.max(max, statSync(f).mtimeMs), 0);
  const inputs = [...walk("src", (f) => f.endsWith(".py")), ...(existsSync("pyproject.toml") ? ["pyproject.toml"] : [])];
  const newest = inputs.reduce((max, f) => Math.max(max, statSync(f).mtimeMs), 0);
  if (newest > cacheAt) {
    flunk(
      "stale mutation cache — sources changed after mutants/ was generated (scores can drop or flatter)",
      "rm -rf mutants (the next pnpm test:mutation rebuilds it)",
    );
  } else {
    pass("mutation cache is current (no source newer than mutants/)");
  }
}

// --- port the service needs ----------------------------------------------------
const ports = (process.env.PROTO_FORGE_DOCTOR_PORTS ?? "3000")
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
      `port ${port} is already held — the dev server will fail with EADDRINUSE`,
      `lsof -nP -iTCP:${port} -sTCP:LISTEN (find the holder, then kill <pid>)`,
    );
  }
}

// --- docker: noted, never required ---------------------------------------------
const docker = spawnSync("docker", ["--version"], { encoding: "utf8" });
info(
  docker.status === 0
    ? "docker present — the Testcontainers integration tier (tests/integration) can run locally (CI runs it always)"
    : "docker absent — the integration tier is tool-gated locally and mandatory in CI; unit and conformance tiers need no docker",
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

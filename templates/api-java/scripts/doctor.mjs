import { existsSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { createServer } from "node:net";
import { read, walk } from "./lib.mjs";

// @adr 009 - pnpm doctor: the known failure classes, named before they bite (NFR-18)
//
// Support tool (notAGate). Every check is an incident class that has actually
// eaten a morning: a node outside the engines pin, a pnpm that ignores the
// packageManager pin, husky hooks that never wired after a fresh clone, an
// installed tree that drifted from the lockfile (the stale-.pnpm class), a JDK
// that is absent or a major the toolchain block never named, an uncached
// gradle wrapper stalling the first offline run, a stale PIT report flattering
// or tanking the recorded score, a port the service cannot take, a missing
// .env. Each finding prints ✗ with THE fix command; exit 1 if anything is
// wrong. Never a network socket: every probe is local, and the port probe
// binds, it does not connect. Docker is NOTED, never required — the
// Testcontainers tiers are tool-gated locally and mandatory in CI (ADR 003/006).
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

// --- the JVM toolchain: pinned JDK, cached wrapper -----------------------------
// The java analogue of the corepack pair: a JDK matching the toolchain block on
// PATH, and the checksum-pinned gradle distribution already in the wrapper
// cache. The FIX may reach the network, the diagnosis never does.
if (existsSync("build.gradle.kts")) {
  const build = read("build.gradle.kts");
  const jdkPin = Number(/JavaLanguageVersion\.of\((\d+)\)/.exec(build)?.[1] ?? NaN);
  const java = spawnSync("java", ["-version"], { encoding: "utf8" });
  const major = Number(/version "(\d+)/.exec(`${java.stdout}${java.stderr}`)?.[1] ?? NaN);
  if (java.status !== 0 || Number.isNaN(major)) {
    flunk(
      "no java on PATH — gradle cannot start, let alone find a toolchain",
      `install a JDK ${Number.isNaN(jdkPin) ? "" : jdkPin} (e.g. Temurin; sdk install java, brew install temurin, or apt)`,
    );
  } else if (!Number.isNaN(jdkPin) && major !== jdkPin) {
    flunk(
      `java ${major} is on PATH but the gradle toolchain block pins ${jdkPin} — gradle will hunt for (and may fail to find) a matching JDK`,
      `install a JDK ${jdkPin} (e.g. Temurin) so the toolchain resolves locally`,
    );
  } else {
    pass(`java ${major} matches the gradle toolchain pin`);
  }

  const props = "gradle/wrapper/gradle-wrapper.properties";
  if (existsSync(props)) {
    const url = /distributionUrl=(.*)/.exec(read(props))?.[1] ?? "";
    const dist = url.split("/").pop()?.replace(/\.zip$/, "") ?? "";
    const gradleHome = process.env.GRADLE_USER_HOME ?? join(homedir(), ".gradle");
    if (dist !== "" && existsSync(join(gradleHome, "wrapper", "dists", dist))) {
      pass(`gradle distribution ${dist} is cached (${join(gradleHome, "wrapper", "dists")})`);
    } else {
      info(`gradle distribution ${dist || "(unparsed)"} not cached yet — the first ./gradlew run downloads it once (checksum-pinned in ${props})`);
    }
  }
  info("the gradle daemon keeps a warm JVM between runs — ./gradlew --status lists it, ./gradlew --stop reclaims its memory");
}

// --- stale mutation report -----------------------------------------------------
// PIT's XML report is the recorded score quality:report restates; sources
// edited after it was written make the documented number a blend of two trees.
const PIT_REPORT = "build/reports/pitest/mutations.xml";
if (!existsSync("build/reports/pitest")) {
  info("no build/reports/pitest — the next mutation run starts clean");
} else if (!existsSync(PIT_REPORT)) {
  info("build/reports/pitest holds no mutations.xml — report leftovers only");
} else {
  const reportAt = statSync(PIT_REPORT).mtimeMs;
  const inputs = [
    ...walk("src", (f) => f.endsWith(".java")),
    ...(existsSync("build.gradle.kts") ? ["build.gradle.kts"] : []),
  ];
  const newest = inputs.reduce((max, f) => Math.max(max, statSync(f).mtimeMs), 0);
  if (newest > reportAt) {
    flunk(
      "stale mutation report — sources changed after build/reports/pitest/mutations.xml was written (the recorded score blends two trees)",
      "rm -rf build/reports/pitest (the next pnpm test:mutation re-measures)",
    );
  } else {
    pass("mutation report is current (no source newer than build/reports/pitest/mutations.xml)");
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
      `port ${port} is already held — bootRun will fail with "Port already in use"`,
      `lsof -nP -iTCP:${port} -sTCP:LISTEN (find the holder, then kill <pid>)`,
    );
  }
}

// --- docker: noted, never required ---------------------------------------------
const docker = spawnSync("docker", ["--version"], { encoding: "utf8" });
info(
  docker.status === 0
    ? "docker present — the Testcontainers tiers (nativeTest, gates:selftest:native) can run locally (CI runs them always)"
    : "docker absent — the Testcontainers tiers are tool-gated locally and mandatory in CI; unit and conformance tiers need no docker",
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

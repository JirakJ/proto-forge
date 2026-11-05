#!/usr/bin/env node
// proto-forge bootstrap — fetches the proto-forge plugin, pinned to one release tag
// AND its commit, into the user's cache directory and prints where it landed.
//
// Why this exists: proto-forge's first action is to copy an app template byte for
// byte into the user's new project. A marketplace that serves skill files on demand
// and forbids saving them cannot carry ~2,300 template files, so the listing ships
// this script and the plugin comes from its public, MIT-licensed source repository.
//
// Self-contained by design: the marketplace runs this file alone, so every value it
// needs is a constant below (stamped by scripts/agensi-package.mjs at release time).
//
// Network: exactly one host, github.com, via `git clone` over HTTPS. Nothing else is
// contacted, nothing is uploaded, no credential or environment variable is read
// beyond HOME / XDG_CACHE_HOME / LOCALAPPDATA to locate the cache directory.
//
// Output: one JSON object on stdout. Exit 0 = ready, exit 1 = not ready (the JSON
// then carries `error` and a `remedy` the agent must relay to the user verbatim).

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, renameSync, rmSync, statSync } from "node:fs";
import { homedir, platform } from "node:os";
import { join } from "node:path";

const REPOSITORY = "https://github.com/JirakJ/proto-forge.git";
const REF = "__PROTO_FORGE_REF__";
const COMMIT = "__PROTO_FORGE_COMMIT__";
const SKILLS = ["proto-forge", "discovery", "survey", "elicit"];

function emit(result, code) {
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exit(code);
}

function failWith(error, remedy, extra = {}) {
  emit({ ready: false, ref: REF, commit: COMMIT, error, remedy, ...extra }, 1);
}

function git(args, cwd) {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0", GIT_ADVICE: "0" },
  }).trim();
}

function toolVersion(command, args) {
  try {
    return execFileSync(command, args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      shell: platform() === "win32",
    }).trim();
  } catch {
    return null;
  }
}

function cacheRoot() {
  if (platform() === "win32") {
    const base = process.env.LOCALAPPDATA;
    return join(base !== undefined && base !== "" ? base : join(homedir(), "AppData", "Local"), "proto-forge");
  }
  if (platform() === "darwin") return join(homedir(), "Library", "Caches", "proto-forge");
  const xdg = process.env.XDG_CACHE_HOME;
  return join(xdg !== undefined && xdg !== "" ? xdg : join(homedir(), ".cache"), "proto-forge");
}

/** A checkout counts only if it is a clean git tree at exactly the pinned commit. */
function inspect(dir) {
  try {
    const head = git(["rev-parse", "HEAD"], dir);
    if (head !== COMMIT) return `HEAD is ${head}, expected ${COMMIT}`;
    const dirty = git(["status", "--porcelain", "--untracked-files=no"], dir);
    if (dirty !== "") return "tracked files were modified";
    if (!existsSync(join(dir, "SKILL.md"))) return "SKILL.md is missing";
    return null;
  } catch (error) {
    return `not a readable git checkout (${String(error.message ?? error).split("\n")[0]})`;
  }
}

function layout(root) {
  const skills = Object.fromEntries(
    SKILLS.map((name) => [name, join(root, ...(name === "proto-forge" ? [] : ["skills", name]), "SKILL.md")]),
  );
  return { root, entry: skills["proto-forge"], skills };
}

function prerequisites() {
  const node = process.versions.node;
  const pnpm = toolVersion("pnpm", ["--version"]);
  return {
    node,
    nodeOk: Number(node.split(".")[0]) === 22,
    pnpm,
    pnpmOk: pnpm === "10.11.0",
    note: "Generated projects need Node 22.x and pnpm 10.11.0, plus the native toolchain of the chosen stack; proto-forge itself reports anything missing before it scaffolds.",
  };
}

// --- main ---------------------------------------------------------------------

if (!/^v\d+\.\d+\.\d+$/.test(REF) || !/^[0-9a-f]{40}$/.test(COMMIT)) {
  failWith("this bootstrap was not stamped with a release", "Reinstall the proto-forge listing; the packaged script is incomplete.");
}

if (Number(process.versions.node.split(".")[0]) < 18) {
  failWith(`Node ${process.versions.node} is too old to run the bootstrap`, "Install Node 22 (https://nodejs.org) and run the skill again.");
}

if (toolVersion("git", ["--version"]) === null) {
  failWith("git is not installed or not on PATH", "Install git (https://git-scm.com/downloads) and run the skill again.");
}

const base = cacheRoot();
const target = join(base, `${REF}-${COMMIT.slice(0, 12)}`);

if (existsSync(target)) {
  const problem = inspect(target);
  if (problem === null) emit({ ready: true, reused: true, ref: REF, commit: COMMIT, ...layout(target), prerequisites: prerequisites() }, 0);
  failWith(
    `the cached checkout at ${target} cannot be trusted: ${problem}`,
    `Ask the user to delete ${target} (it holds only the cached plugin) and then run the skill again.`,
    { path: target },
  );
}

mkdirSync(base, { recursive: true });
const staging = `${target}.partial-${process.pid}`;
if (existsSync(staging)) rmSync(staging, { recursive: true, force: true });

try {
  git(
    ["clone", "--quiet", "--depth", "1", "--branch", REF, "--single-branch", "--no-tags", "-c", "core.autocrlf=false", REPOSITORY, staging],
    base,
  );
  const problem = inspect(staging);
  if (problem !== null) {
    rmSync(staging, { recursive: true, force: true });
    failWith(
      `the downloaded ${REF} does not match the pinned commit: ${problem}`,
      "Do not use this download. Tell the user the release tag no longer points at the published commit and report it at https://github.com/JirakJ/proto-forge/issues.",
    );
  }
  renameSync(staging, target);
} catch (error) {
  if (existsSync(staging) && statSync(staging).isDirectory()) rmSync(staging, { recursive: true, force: true });
  const detail = String(error.stderr ?? error.message ?? error).trim().split("\n").slice(-3).join(" | ");
  failWith(
    `cloning ${REPOSITORY} at ${REF} failed: ${detail}`,
    "Check that this machine can reach github.com over HTTPS, then run the skill again.",
  );
}

emit({ ready: true, reused: false, ref: REF, commit: COMMIT, ...layout(target), prerequisites: prerequisites() }, 0);

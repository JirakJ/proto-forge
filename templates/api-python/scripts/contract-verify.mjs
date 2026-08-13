import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { read, fail, ok } from "./lib.mjs";
import { gateResult } from "./config.mjs";

// @adr 008 - the committed contract is a locked derivation of the code (BR-22)
//
// contract/openapi.json is never hand-edited: it is regenerated from the
// registry-wired app by the emitter (app/contract_emit.py — FastAPI's native
// app.openapi(), normalized to canonical JSON on stdout) and byte-compared
// against the committed spec. contract.lock pins the committed spec's sha256
// and the contract's own SemVer. Either the code changed and the lock proves
// it, or nothing changed.
//
//   pnpm contract:verify           compare; any drift fails
//   pnpm contract:verify --write   regenerate spec + lock (via pnpm contract:generate)
//
// Selftest seam: PROTO_FORGE_CONTRACT_EMIT names a plain .mjs emitter to spawn
// with `node` instead of `uv run python` — gate selftests run in throwaway
// directories where no python environment exists, and the contract discipline
// being tested is byte-comparison, not emission.

const SPEC = "contract/openapi.json";
const LOCK = "contract/contract.lock";
const EMITTER = "app.contract_emit";

const sha256 = (text) => createHash("sha256").update(text).digest("hex");
const normalize = (text) => text.replace(/\n+$/, "") + "\n";

function emit() {
  const override = process.env.PROTO_FORGE_CONTRACT_EMIT;
  const spawn = override
    ? spawnSync(process.execPath, [override], { encoding: "utf8" })
    : spawnSync("uv", ["run", "python", "-m", EMITTER], { encoding: "utf8" });
  if (spawn.error || spawn.status !== 0) {
    fail("contract: the emitter failed — the contract cannot be derived", [
      (spawn.stderr ?? spawn.error?.message ?? "").trim().slice(0, 500),
    ]);
  }
  return normalize(spawn.stdout);
}

const emitted = emit();

if (process.argv.includes("--write")) {
  mkdirSync("contract", { recursive: true });
  writeFileSync(SPEC, emitted);
  const info = JSON.parse(emitted);
  const lock = {
    sha256: sha256(emitted),
    contractVersion: info.info?.version ?? "0.0.0",
  };
  writeFileSync(LOCK, JSON.stringify(lock, null, 2) + "\n");
  ok(`contract: spec regenerated (${lock.contractVersion}), lock sha256=${lock.sha256.slice(0, 12)}…`);
  process.exit(0);
}

const errors = [];

if (!existsSync(SPEC)) {
  errors.push(`${SPEC} is missing — run: pnpm contract:generate (and commit the spec)`);
} else if (normalize(read(SPEC)) !== emitted) {
  errors.push(
    `${SPEC}: code drift from the committed spec — the routes/schemas no longer regenerate ` +
      `the committed bytes; run pnpm contract:generate and review the diff`,
  );
}

if (!existsSync(LOCK)) {
  errors.push(`${LOCK} is missing — the contract has no pinned sha256/version`);
} else if (existsSync(SPEC)) {
  const lock = JSON.parse(read(LOCK));
  const actual = sha256(normalize(read(SPEC)));
  if (lock.sha256 !== actual) {
    errors.push(
      `${LOCK}: stale contract.lock — it pins sha256 ${String(lock.sha256).slice(0, 12)}… but the committed ` +
        `spec hashes ${actual.slice(0, 12)}…; run pnpm contract:generate`,
    );
  }
  if (typeof lock.contractVersion !== "string" || !/^\d+\.\d+\.\d+$/.test(lock.contractVersion)) {
    errors.push(`${LOCK}: contractVersion must be SemVer, got ${JSON.stringify(lock.contractVersion)}`);
  }
}

gateResult("contract", "contract:verify: committed spec matches the regeneration, lock intact", errors);

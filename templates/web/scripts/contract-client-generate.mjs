import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname } from "node:path";
import { walk, fail, ok } from "./lib.mjs";

// Regenerates the typed client from the RECORDED contract and re-pins the lock
// contract:client verifies (BR-22's consumer half). openapi-typescript is added
// by the api facet (T6), never pre-installed — absence gets guidance, not a stack.

const RECORD_DIR = "docs/external/api-contract";
const LOCK = "src/api/.client.lock";
const CLIENT = "src/api/client.d.ts";

const contracts = existsSync(RECORD_DIR) ? walk(RECORD_DIR, (p) => p.endsWith("openapi.json")) : [];
if (contracts.length !== 1) {
  fail("contract:client:generate FAILED", [
    contracts.length === 0
      ? `${RECORD_DIR}/ holds no recorded openapi.json — record the consumed contract first (BR-18)`
      : `${RECORD_DIR}/ holds ${contracts.length} recorded contracts — one consumer, one contract`,
  ]);
}

const probe = spawnSync("pnpm", ["exec", "openapi-typescript", "--version"], { encoding: "utf8" });
if (probe.status !== 0) {
  fail("contract:client:generate FAILED", [
    "openapi-typescript is not installed — the api facet adds it (T6), never the template:",
    "  pnpm add -D openapi-typescript",
  ]);
}

mkdirSync(dirname(CLIENT), { recursive: true });
const gen = spawnSync("pnpm", ["exec", "openapi-typescript", contracts[0], "-o", CLIENT], {
  encoding: "utf8",
  stdio: "inherit",
});
if (gen.status !== 0) fail("contract:client:generate FAILED", [`openapi-typescript exited ${gen.status}`]);

const sha = createHash("sha256").update(readFileSync(contracts[0])).digest("hex");
writeFileSync(LOCK, `${JSON.stringify({ contractSha256: sha, source: contracts[0] }, null, 2)}\n`);
ok(`contract:client:generate: ${CLIENT} regenerated from ${contracts[0]} (sha256 ${sha.slice(0, 12)}…)`);

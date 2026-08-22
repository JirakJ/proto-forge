import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { read, fail, ok } from "./lib.mjs";
import { gateResult } from "./config.mjs";

// @adr 008 - the committed contract is a locked derivation of the code (BR-22)
//
// contract/openapi.json is never hand-edited: it is regenerated from the route
// registry and schemas by the emitter (src/adapters/in/http/emit.ts, canonical
// JSON on stdout) and byte-compared against the committed spec. contract.lock
// pins the committed spec's sha256 and the contract's own SemVer. Either the code
// changed and the lock proves it, or nothing changed.
//
//   pnpm contract:verify           compare; any drift fails
//   pnpm contract:verify --write   regenerate spec + lock (via pnpm contract:generate)
//
// Selftest seam: PROTO_FORGE_CONTRACT_EMIT names a plain .mjs emitter to spawn
// with `node` instead of `pnpm exec tsx` — gate selftests run in throwaway
// directories where no package manager or TypeScript runtime exists, and the
// contract discipline being tested is byte-comparison, not transpilation.

const SPEC = "contract/openapi.json";
const LOCK = "contract/contract.lock";
const EMITTER = "src/adapters/in/http/emit.ts";

const sha256 = (text) => createHash("sha256").update(text).digest("hex");
const normalize = (text) => text.replace(/\n+$/, "") + "\n";

function emit() {
  const override = process.env.PROTO_FORGE_CONTRACT_EMIT;
  const spawn = override
    ? spawnSync(process.execPath, [override], { encoding: "utf8" })
    : spawnSync("pnpm", ["exec", "tsx", EMITTER], { encoding: "utf8" });
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

// NFR-29: collections are paginated. A GET whose 200 is a top-level array is an
// unbounded collection; a GET whose 200 embeds an array must declare `limit`
// plus `offset` or `cursor` query parameters. Checked on the emitted document,
// so the rule holds whatever the route registry looks like.
function jsonSchemaOf(operation, status) {
  return operation?.responses?.[status]?.content?.["application/json"]?.schema;
}
function embedsArray(schema) {
  if (schema === undefined || schema === null) return false;
  if (schema.type === "array") return true;
  return Object.values(schema.properties ?? {}).some((property) => property?.type === "array");
}
const doc = JSON.parse(emitted);
for (const [path, operations] of Object.entries(doc.paths ?? {})) {
  const operation = operations.get;
  if (operation === undefined) continue;
  const ok200 = jsonSchemaOf(operation, "200");
  const where = `${path} (${operation.operationId ?? "no operationId"})`;
  if (ok200?.type === "array") {
    errors.push(`${where}: the 200 response is a top-level array — an unbounded collection; answer with the pagination envelope (NFR-29)`);
    continue;
  }
  if (embedsArray(ok200)) {
    const params = (operation.parameters ?? []).filter((p) => p.in === "query").map((p) => p.name);
    if (!params.includes("limit") || !["offset", "cursor"].some((name) => params.includes(name))) {
      errors.push(`${where}: a collection response must declare "limit" plus "offset" or "cursor" query parameters, found [${params.join(", ")}] (NFR-29)`);
    }
  }
}

// BR-47: the service SERVES its contract — the platform explorer module exists
// and the HTTP composition wires it. The behaviour (the routes answering with
// the committed bytes) is the platform unit suite's proof; this half keeps the
// wiring from being quietly dropped.
const EXPLORER = "src/platform/docs.ts";
const APP = "src/adapters/in/http/app.ts";
if (!existsSync(EXPLORER)) {
  errors.push(`${EXPLORER} is missing — the service does not serve its explorer (BR-47)`);
} else if (existsSync(APP) && !/registerDocs\s*\(/.test(read(APP))) {
  errors.push(`${APP} never calls registerDocs — the explorer exists but nothing serves it (BR-47)`);
}

gateResult("contract", "contract:verify: committed spec matches the regeneration, collections paginated, explorer wired, lock intact", errors);

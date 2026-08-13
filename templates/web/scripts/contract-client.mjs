import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { gateResult } from "./config.mjs";
import { walk, read } from "./lib.mjs";

// The typed client is a locked derivation of the RECORDED contract (BR-22). The
// api facet's own ADR 023 — created at generation time (T6) — records the client
// decision per prototype; the template ships the gate, not the decision.
//
// A paired backend owns contract/openapi.json (its BR-22); this side consumes it
// through a BR-18 record under docs/external/api-contract/ — the provenance-carrying
// copy — and generates the typed client from THAT copy, never from a URL at build
// time. What keeps the pair honest here is the lock: src/api/.client.lock pins the
// sha256 of the recorded contract the committed client was generated from. A newer
// recorded contract with a stale client fails; a client with no recorded source
// fails harder. `pnpm contract:client:generate` regenerates both (openapi-typescript
// arrives WITH the api facet, like MSW — never pre-installed, T6).
//
// No `apiContract` facet (the shipped demo persists locally) = nothing to hold a
// client to, stated out loud rather than skipped silently.

const FACETS = ".proto-forge/facets.json";
const RECORD_DIR = "docs/external/api-contract";
const LOCK = "src/api/.client.lock";
const CLIENT = "src/api/client.d.ts";

const errors = [];
const facets = existsSync(FACETS) ? JSON.parse(read(FACETS)) : {};

if (facets.persistence !== "api") {
  gateResult("client", "contract:client: persistence is not \"api\" — no contract to hold a client to", []);
} else {
  const contracts = existsSync(RECORD_DIR)
    ? walk(RECORD_DIR, (p) => p.endsWith("openapi.json"))
    : [];
  if (contracts.length === 0) {
    errors.push(
      `persistence is "api" but ${RECORD_DIR}/ holds no recorded openapi.json — ` +
        `record the consumed contract first (BR-18: pnpm sync:pull, or copy the artifact ` +
        `next to its record), then pnpm contract:client:generate`,
    );
  } else if (contracts.length > 1) {
    errors.push(`${RECORD_DIR}/ holds ${contracts.length} recorded contracts — one consumer, one contract`);
  } else {
    const sha = createHash("sha256").update(readFileSync(contracts[0])).digest("hex");
    if (!existsSync(LOCK) || !existsSync(CLIENT)) {
      errors.push(
        `the typed client or its lock is missing (${CLIENT}, ${LOCK}) — run pnpm contract:client:generate`,
      );
    } else {
      const lock = JSON.parse(read(LOCK));
      if (lock.contractSha256 !== sha) {
        errors.push(
          `the recorded contract changed (${contracts[0]} → ${sha.slice(0, 12)}…) but the client ` +
            `was generated from ${String(lock.contractSha256).slice(0, 12)}… — run pnpm contract:client:generate`,
        );
      }
    }
  }
  gateResult("client", "contract:client: the typed client matches the recorded contract", errors);
}

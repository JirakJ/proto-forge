# ADR 001: Two suites for the cross-app layer — real-pair flows plus consumer-driven contract replay

- Status: accepted
- Date: 2026-08-13
- Prompt-log: .prompts/0001-scaffold.md

## Context

A workspace pair (api + web, T14) can be green in every per-repo gate and still broken as a PRODUCT: the backend proves "my code matches my spec" (contract:verify) and the frontend proves "my client matches the recorded contract" (contract:client), but nothing yet proves that the RUNNING pair honours the promises each side made — a redeployed api, a stale artifact, a UI wired to the wrong endpoint all live exactly in that gap. The operator fixed the answer: a third, separate `e2e` part with Playwright + TypeScript, sitting next to `api/` and `web/` inside the workspace.

## Decision

**Two suites, both generated from pure-data registries.** (a) The cross-app FLOW suite drives scenarios derived from the brief's flows facets through the REAL web UI against the REAL api — the shipped Note demo (create → list → delete) documents the pattern. (b) The CONSUMER-DRIVEN CONTRACT suite replays each registered expectation per operation with Playwright's request context against the live api: assert the status, then validate the body against the contract's response schema for that operation+status. The contract is the backend's locked artifact, resolved through the workspace manifest (`../workspace.json` `contract.source`; `E2E_CONTRACT` overrides).

**The registries are the single source, held from outside.** `src/flows/cases.ts` and `src/contract/cases.ts` are pure data (the web template's harness split); the specs register one test per case. The `registry` gate (BR-35) proves ids unique and kebab-case, every flow case implemented and every implementation registered, the generated specs still wired, and every contract case's operationId present in the referenced contract whenever that file is reachable — pre-workspace absence is a printed note, never a silent pass.

**Response validation is one dependency-free implementation.** The structural JSON-schema-subset validator lives in `scripts/validate-lib.mjs` (type/required/properties/items/enum/const/additionalProperties/length/pattern/format-lite, $ref, anyOf) and is consumed by the suite through the thin typed facade `src/contract/validate.ts`, by the registry gate, and by the gates-selftest fixtures that prove it rejects what a contract forbids. Vendoring ajv was rejected: this repo ships zero runtime dependencies (`@playwright/test` + the TS toolchain only), and the subset generated contracts use is small; the validator honestly IGNORES schema features outside the subset rather than mis-enforcing them.

**Runtime is tool-gated; verify stays static and offline.** `pnpm verify` runs the static gates only (lint, typecheck, registry, stub, adr, prompt, snapshot, selftest). `pnpm test:e2e` needs the RUNNING pair — the workspace's `ws:up` provides it — and is deliberately NOT in verify: locally an unreachable service or absent contract skips with a note naming the fix; under CI=1 it hard-fails. The e2e-against-pair job is the WORKSPACE repo's orchestration, not this repo's CI.

## Consequences

Pair drift has a dedicated failure with a readable name, and a scenario cannot ship without coverage because the registry and the suite are the same data. The costs are honest: the flow suite depends on the web part's testids (a rename there is a change here — the registry makes it one edit), the contract suite creates real records against a stateful pair (probe texts are marked as such), and the validator's subset must grow deliberately, by ADR, when contracts start using features it ignores.

## Alternatives considered

**Folding e2e into the web repo** — couples the cross-app truth to one consumer and leaves api-only workspaces without it. **Contract conformance only, no browser flows** — misses everything that lives in the UI wiring, which is where pair bugs are actually seen. **Vendoring ajv for validation** — full JSON-schema fidelity at the price of the zero-runtime-deps rule and a supply-chain surface the subset does not need. **Putting test:e2e into verify with an auto-started pair** — verify must stay offline and deterministic (NFR-16); a gate that starts docker is neither.

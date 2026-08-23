# ADR 008: The route registry is the contract's single source; the committed spec is a locked derivation

- Status: accepted
- Date: 2026-08-12
- Prompt-log: .prompts/0001-scaffold.md

## Context

A hand-edited OpenAPI spec and the code it describes drift within days, and the consumer who trusted the spec finds out in production (BR-22). Separately, an operation nothing can name reliably is an operation nothing can test, document or generate a client for without guessing — the frontend's testid lesson verbatim (BR-25).

## Decision

**One registry.** Every HTTP operation is one entry in `src/adapters/in/http/routes.ts`: a kebab-case `<resource>-<verb>` `operationId` (unique across the app, at least one hyphen), the path, zod request/response schemas and the list of problem codes it can emit. The Fastify wiring, the OpenAPI document, the docs examples and the e2e conformance suite are all DERIVED from this table. `opid:scan` fails a malformed or duplicate id and any route path literal registered outside the registry (the byte-pinned kernel's `/healthz` and `/version` are the sole, deliberate exceptions — operational endpoints outside the contract).

**A locked derivation.** `contract/openapi.json` is emitted as canonical JSON (sorted keys, no timestamps) by `src/adapters/in/http/emit.ts` and byte-compared by `contract:verify`; `contract/contract.lock` pins the committed spec's sha256 and the contract's own SemVer. Either the code changed and the lock proves it, or nothing changed. `pnpm contract:generate` is the only way the committed spec moves.

**A breaking policy.** `contract/released/openapi.json` is the last released contract, committed at release time. `contract:breaking` detects the conservative breaking set in pure JS — removed paths/methods/operationIds, removed response codes, newly required request fields, removed required response fields — and passes breaking findings ONLY across a contract major bump, which itself requires an ADR.

**A served surface (BR-47).** The platform kernel serves the committed artefacts to whoever stands in front of a running instance: `GET /openapi.json` answers with `contract/openapi.json` byte-for-byte, and `GET /docs` serves the owned, dependency-free explorer (`src/platform/docs.ts` + `explorerAssets.ts`) rendering every operation with its schemas, problem responses, the captured examples and curl usage — under a scoped CSP, with no external asset anywhere. `buildApp` takes the artefacts as an injected `DocsDeps`; the composition root loads them with `loadDocsFromDisk()` and the Dockerfile ships `contract/` and `docs/api/` into the runtime image. Like `/healthz`, these are platform routes outside the contract: they are how a consumer reaches the API surface, not the surface itself. `contract:verify` fails a service whose explorer wiring is gone; the platform unit suite proves the serving.

**Two projections of one schema.** The emitter renders requests from zod's *input* view (a defaulted query parameter is optional to the caller) and responses from the *output* view (the same default is always present in an answer) — which is what lets the pagination envelope (NFR-29) declare optional `limit`/`offset` inputs and guaranteed `limit`/`offset` outputs from a single schema pair.

## Consequences

Contract drift is structurally impossible rather than procedurally discouraged. Clients, docs and tests key on operationIds that cannot collide. An integrator with nothing but a URL gets the explorer and the machine-readable contract from the service itself, and both are exactly the committed bytes. The cost is that quick ad hoc endpoints do not exist — every operation is a registry entry with a schema and an error list, which is what "contract-first" costs.

## Alternatives considered

Spec-first with generated server stubs (the spec drifts from the handlers instead), oasdiff for breaking detection (a pinned external binary against ADR 007's own rule; the conservative in-house diff covers the set the register names), semantic spec comparison (byte comparison is the only drift definition that cannot argue).

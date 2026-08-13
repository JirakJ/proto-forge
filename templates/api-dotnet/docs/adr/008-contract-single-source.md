# ADR 008: The route registry is the contract's single source; the committed spec is a locked derivation

- Status: accepted
- Date: 2026-08-13
- Prompt-log: .prompts/0001-scaffold.md

## Context

A hand-edited OpenAPI spec and the code it describes drift within days, and the consumer who trusted the spec finds out in production (BR-22). Separately, an operation nothing can name reliably is an operation nothing can test, document or generate a client for without guessing — the frontend's testid lesson verbatim (BR-25).

## Decision

**One registry.** Every HTTP operation is one entry in `app.adapter.in.web.RouteRegistry` (a RouteDef built with the parseable builder): a kebab-case `<resource>-<verb>` `operationId` (unique across the app, at least one hyphen), the path, the request/response shapes and the list of problem codes it can emit. The Spring MVC wiring (`RouteRegistrar` registers every def against the handler bean claiming its operationId — handlers are mapping-annotation-free `@RestController`s with one `handle(...)` method), the OpenAPI document, the docs examples and the e2e conformance suite are all DERIVED from this table. `opid:scan` fails a malformed or duplicate id and any `@…Mapping` path literal outside the registry (the byte-pinned kernel's `/healthz` and `/version` are the sole, deliberate exceptions — operational endpoints outside the contract).

**A locked derivation, emitted by a test slice.** springdoc-openapi is `testImplementation` ONLY: `./gradlew contractEmit` boots a MockMvc slice — no socket, no database, the fixture repository behind the port — where springdoc introspects the registered handler methods for schemas and the registry-driven customizers overlay operationIds, summaries and the response/problem sets, writing the raw document to `build/contract/`. `scripts/contract-verify.mjs` then runs the shared normalizer (`scripts/contract-normalize.mjs`: recursively sorted keys, volatile `servers`/`tags` stripped — canonical JSON, §14) and byte-compares against `contract/openapi.json`; `contract/contract.lock` pins the committed spec's sha256 and the contract's own SemVer. Either the code changed and the lock proves it, or nothing changed. `pnpm contract:generate` is the only way the committed spec moves. The running application serves no spec endpoint — the contract is a build artefact, not a route.

**A breaking policy.** `contract/released/openapi.json` is the last released contract, committed at release time. `contract:breaking` detects the conservative breaking set in pure JS — removed paths/methods/operationIds, removed response codes, newly required request fields, removed required response fields — and passes breaking findings ONLY across a contract major bump, which itself requires an ADR.

## Consequences

Contract drift is structurally impossible rather than procedurally discouraged. Clients, docs and tests key on operationIds that cannot collide. The costs: quick ad hoc `@GetMapping`s do not exist — every operation is a registry entry with shapes and an error list — and the emitted document's fidelity leans on the customizers, whose output the lock and the conformance suite hold still.

## Alternatives considered

Serving springdoc at runtime (ships a documentation engine in the production surface for an artefact the build derives; the budget rejects it), spec-first with generated server stubs (the spec drifts from the handlers instead), building the document by hand from the registry without springdoc (re-implements schema derivation springdoc already proves against the real handler signatures), oasdiff for breaking detection (a pinned external binary against ADR 007's own rule; the conservative in-house diff covers the set the register names).

# ADR 008: The route registry is the contract's single source; the committed spec is a locked derivation

- Status: accepted
- Date: 2026-08-13
- Prompt-log: .prompts/0001-scaffold.md

## Context

A hand-edited OpenAPI spec and the code it describes drift within days, and the consumer who trusted the spec finds out in production (BR-22). Separately, an operation nothing can name reliably is an operation nothing can test, document or generate a client for without guessing — the frontend's testid lesson verbatim (BR-25).

## Decision

**One registry.** Every HTTP operation is one entry in `App.Adapters.In.Http.RouteRegistry` (a `RouteDef` record whose members are `required`, so a definition cannot omit its shapes or its error list): a kebab-case `<resource>-<verb>` `OperationId` (unique across the app, at least one hyphen), the path, the request and response shapes as domain types, and the list of problem codes it can emit. The minimal-API wiring (`RouteRegistrar` maps every def to the handler delegate claiming its operationId, and fails loudly at startup on either half of a mismatch), the OpenAPI document, the docs examples and the e2e conformance suite are all DERIVED from this table. `opid:scan` fails a malformed or duplicate id and any `Map…("/…")` path literal outside the registry (the byte-pinned kernel's `/healthz` and `/version` are the sole, deliberate exceptions — operational endpoints outside the contract).

**A locked derivation, emitted by the app itself.** `src/App/Adapters/In/Http/OpenApiEmitter.cs` builds the document as a pure function of the registry plus the domain records' own DataAnnotations — never by introspecting handlers, so it cannot drift from the single source — and the application exposes it as a console mode: `dotnet run --project src/App -- --emit-openapi` prints the raw document and exits, with no socket, no database and no host. `scripts/contract-verify.mjs` then runs the shared normalizer (`scripts/contract-normalize.mjs`: recursively sorted keys, volatile members stripped — canonical JSON, §14) and byte-compares against `contract/openapi.json`; `contract/contract.lock` pins the committed spec's sha256 and the contract's own SemVer. Either the code changed and the lock proves it, or nothing changed. `pnpm contract:generate` is the only way the committed spec moves. `tests/App.Tests/Contract/EmitDeterminismTest.cs` pins the emitter's precondition — two emits are byte-identical, and every registry operation reaches the document — where a refactor would first break it. The running application serves no spec endpoint: the contract is a build artefact, not a route.

**A breaking policy.** `contract/released/openapi.json` is the last released contract, committed at release time. `contract:breaking` detects the conservative breaking set in pure JS — removed paths/methods/operationIds, removed response codes, newly required request fields, removed required response fields — and passes breaking findings ONLY across a contract major bump, which itself requires an ADR.

## Consequences

Contract drift is structurally impossible rather than procedurally discouraged. Clients, docs and tests key on operationIds that cannot collide. The costs: quick ad hoc `app.MapGet("/…")` calls do not exist — every operation is a registry entry with shapes and an error list — and the emitter is code this template owns, so its schema derivation is held still by the lock, the determinism test and the conformance suite rather than by a vendor's introspection.

## Alternatives considered

Serving a generated document at runtime (ships a documentation engine in the production surface for an artefact the build derives; the budget rejects it), the framework's own OpenAPI document generation over the mapped endpoints (derives from the wiring rather than from the registry, so the registry stops being the single source and a mapped-but-unregistered route becomes describable), spec-first with generated server stubs (the spec drifts from the handlers instead), oasdiff for breaking detection (a pinned external binary against ADR 007's own rule; the conservative in-house diff covers the set the register names).

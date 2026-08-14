# ADR 008: The route registry is the contract's single source; the committed spec is a locked derivation

- Status: accepted
- Date: 2026-08-13
- Prompt-log: .prompts/0001-scaffold.md

## Context

A hand-edited OpenAPI spec and the code it describes drift within days, and the consumer who trusted the spec finds out in production (BR-22). Separately, an operation nothing can name reliably is an operation nothing can test, document or generate a client for without guessing — the frontend's testid lesson verbatim (BR-25).

Ktor has no springdoc. That is the interesting constraint of this template, and it turns out to be the better position rather than a gap to paper over.

## Decision

**One registry.** Every HTTP operation is one entry in `app.adapters.in.http.RouteRegistry` (a `RouteDef` written with named arguments so it stays mechanically parseable): a kebab-case `<resource>-<verb>` `operationId` (unique across the app, at least one hyphen), the method, the path, a summary, the request/response `SerialDescriptor`s and the list of problem codes it can emit. The Ktor wiring (`Routing.registerRoutes` installs one `route(path, method)` per row and dispatches to the handler registered under the same operationId), the OpenAPI document, the docs examples and the e2e conformance suite are all DERIVED from this table. `opid:scan` fails a malformed or duplicate id and any Ktor routing path literal (`get("/…")`, `route("/…")`, …) outside the registry — the byte-pinned kernel's `/healthz`, `/version` and its tailcard fallback are the sole, deliberate exceptions: operational endpoints outside the contract.

**A derivation, not an introspection.** The emitter (`slices/OpenApiEmitter.kt`, test-scoped) builds the document from the two declarations that already exist — the registry, and the `SerialDescriptor` each domain type carries — by walking descriptors into JSON Schema (`StructureKind.CLASS` becomes a component and a `$ref`, `LIST` becomes an array, primitives carry their `format` from the descriptor's `serialName`). `./gradlew contractEmit` runs it as a tagged test: **no socket, no database, no booted application at all**, writing the raw document to `build/contract/`. `scripts/contract-verify.mjs` then runs the shared normalizer (`scripts/contract-normalize.mjs`, byte-identical across the backend templates: recursively sorted keys, volatile `servers`/`tags` stripped — canonical JSON, §14) and byte-compares against `contract/openapi.json`; `contract/contract.lock` pins the committed spec's sha256 and the contract's own SemVer. Determinism is structural: the emitter is a pure function of the registry (a unit test asserts two runs are byte-identical), key order is the normalizer's, and nothing reads a clock or a hostname. `pnpm contract:generate` is the only way the committed spec moves. The running application serves no spec endpoint — the contract is a build artefact, not a route.

**Two honest limits of a descriptor-derived spec**, stated rather than hidden. A `SerialDescriptor` carries names, kinds and optionality but no *constraints*: `NoteCreate.text` appears as `{"type":"string"}` with no `maxLength`, because the 2000-character rule lives in `NoteCreate.violations()` where it is enforced, and inventing a second place to declare it is exactly the drift BR-22 exists to stop. It is documented in `docs/api/notes-create/README.md` and observable as the `validation-failed` problem the operation declares. Likewise a path parameter is emitted as `{"type":"string"}`: the registry states the path, not a narrower type for `{id}`, and the uuid rule shows up as the same registered problem. Both are widenings, never narrowings — a client generated from this spec sends what the service accepts.

**A breaking policy.** `contract/released/openapi.json` is the last released contract, committed at release time. `contract:breaking` detects the conservative breaking set in pure JS — removed paths/methods/operationIds, removed response codes, newly required request fields, removed required response fields — and passes breaking findings ONLY across a contract major bump, which itself requires an ADR.

## Consequences

Contract drift is structurally impossible rather than procedurally discouraged, and the derivation needs neither a running server nor a documentation engine on the classpath — the emitter is ~200 lines of test-scoped Kotlin reading declarations this service already had. Clients, docs and tests key on operationIds that cannot collide. The costs: quick ad hoc `get("/…")` routes do not exist — every operation is a registry entry with shapes and an error list — and constraint metadata that an annotation-driven generator would have surfaced has to be written into the docs page instead.

## Alternatives considered

**A springdoc-style runtime introspection** (does not exist for Ktor; the closest options scrape a booted server, which needs a socket and a context the emit tier deliberately avoids). **Ktor's OpenAPI/Swagger plugins** (they *serve* a spec you wrote by hand — the drift this ADR exists to prevent, plus a documentation engine in the production surface). **Spec-first with generated server stubs** (the spec drifts from the handlers instead). **Extending `RouteDef` with a hand-written schema per operation** (a second source of truth beside the descriptor, and the first thing to go stale). **oasdiff for breaking detection** (a pinned external binary against ADR 007's own rule; the conservative in-house diff covers the set the register names).

# ADR 008: The route registry is the contract's single source; the committed spec is a locked derivation

- Status: accepted
- Date: 2026-08-13
- Prompt-log: .prompts/0001-scaffold.md

## Context

A hand-edited OpenAPI spec and the code it describes drift within days, and the consumer who trusted the spec finds out in production (BR-22). Separately, an operation nothing can name reliably is an operation nothing can test, document or generate a client for without guessing — the frontend's testid lesson verbatim (BR-25).

## Decision

**One registry.** Every HTTP operation is one entry in `src/app/adapters/inbound/http/routes.py`: a kebab-case `<resource>-<verb>` `operation_id` (unique across the app, at least one hyphen), the path, the typed endpoint whose pydantic signature validates the boundary, the success shape and the list of problem codes it can emit. The FastAPI wiring, the OpenAPI document, the docs examples and the e2e conformance suite are all DERIVED from this table. `opid:scan` fails a malformed or duplicate id and any route path literal registered outside the registry (the byte-pinned kernel's `/healthz` and `/version` are the sole, deliberate exceptions — operational endpoints outside the contract, `include_in_schema=False`).

**A locked derivation, natively emitted.** `contract/openapi.json` is FastAPI's own `app.openapi()` over the registry-wired app, normalized by `app/contract_emit.py` — keys recursively sorted, the framework's 422/HTTPValidationError noise stripped (this service emits the registered 400 problem instead), the catalogue's `Problem` schema injected — and byte-compared by `contract:verify`; `contract/contract.lock` pins the committed spec's sha256 and the contract's own SemVer. Either the code changed and the lock proves it, or nothing changed. `pnpm contract:generate` is the only way the committed spec moves.

**A breaking policy.** `contract/released/openapi.json` is the last released contract, committed at release time. `contract:breaking` detects the conservative breaking set in pure JS — removed paths/methods/operationIds, removed response codes, newly required request fields, removed required response fields — and passes breaking findings ONLY across a contract major bump, which itself requires an ADR.

## Consequences

Contract drift is structurally impossible rather than procedurally discouraged. Clients, docs and tests key on operationIds that cannot collide. The cost is that quick ad hoc endpoints do not exist — every operation is a registry entry with a typed endpoint and an error list, which is what "contract-first" costs.

## Alternatives considered

Spec-first with generated server stubs (the spec drifts from the handlers instead), building the document by hand from the registry (re-implements what FastAPI derives natively and drifts from the running validation), oasdiff for breaking detection (a pinned external binary against ADR 007's own rule; the conservative in-house diff covers the set the register names), semantic spec comparison (byte comparison is the only drift definition that cannot argue).

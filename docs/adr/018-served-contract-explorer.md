# ADR 018: The service serves its contract and an owned explorer

- Status: accepted
- Date: 2026-08-22
- Prompt-log: docs/specs/2026-08-22-production-output-bar-design.md (stated by the operator: "for the backend I expect OpenAPI compliance and a ready swagger with usage examples")

## Context

The backend templates already guarantee the contract exists and cannot lie:
`contract/openapi.json` is a locked derivation of the route registry (BR-22),
every operation carries a deterministic id (BR-25), every error is a registered
problem type (BR-23), and every operation's docs show a captured — never
hand-written — example (BR-26). What nothing guaranteed: that a consumer
standing in front of a *running instance* can reach any of it. A spec in the
repository serves the team that wrote it; the integrating team gets a URL.

## Decision

**The platform kernel serves the committed artefacts (BR-47).** `GET
/openapi.json` answers with `contract/openapi.json` byte-for-byte, and `GET
/docs` serves an **owned, dependency-free explorer** rendering every operation
with its schemas, problem responses, the captured BR-26 examples (now carrying
each scenario's `note`) and copy-paste curl usage. Like `/healthz`, these are
platform routes: no operationId, no contract entry — they are how a consumer
reaches the API surface, not the surface itself.

**Owned, not vendored.** Swagger UI via `@fastify/swagger-ui` would add a
runtime dependency against NFR-13's budget, external assets against the CSP,
and a second source of truth (a UI that re-derives the spec from code the
committed contract already derives from). The explorer is three static assets
(`explorerAssets.ts`) served under a scoped CSP (`script-src 'self'`,
`style-src 'self'`, `connect-src 'self'` — the API-wide policy stays
deny-everything), reading `/openapi.json` and `/docs/examples.json`, so it
*cannot* disagree with what the repository pins. Air-gapped deployments render
it fully.

**Injected, not read in place.** `buildApp` takes `docs: DocsDeps`; the
composition root loads them with `loadDocsFromDisk()` (fail-fast when the
contract is missing), and the Dockerfile ships `contract/` and `docs/api/` into
the runtime image. The platform module stays a pure function of its inputs and
the unit suite proves the serving with fixtures, at the 100 % platform floor.

**Enforcement is split honestly:** behaviour by the platform unit suite;
wiring — `src/platform/docs.ts` exists and `app.ts` calls `registerDocs` — by
`contract:verify`, with a selftest case. Landed for `api-node`; the remaining
stacks follow the staging table in the spec (FastAPI's half is routes serving
the *committed* artefacts — its built-in `/docs` renders a runtime-derived spec,
which is exactly the second source of truth this decision rejects). BR-47's
scope widens with each landing, never ahead of it.

## Consequences

`docker run` of a generated service gives an integrator `/docs` with real
captured exchanges and `/openapi.json` for their tooling — no repository access
required. The demo's captured examples grew from 9 to 11 (the pagination
scenarios) and each carries its note. The seed lock moved (platform/ and
scripts/ are the api seed) and the contract was re-locked in the same change.

## Alternatives considered

- **`@fastify/swagger` + `@fastify/swagger-ui`**: re-derives the spec at
  runtime (drift by construction), pulls external-looking assets under the CSP,
  and costs two runtime dependencies of the eight the budget allows.
- **Embedding examples into the OpenAPI document**: makes the contract's bytes
  depend on capture artefacts, entangling BR-22's lock with BR-26's; serving
  them side-by-side keeps both locks single-purpose.
- **Static docs site generated at build time**: another artefact to stale;
  serving the committed files needs no generation step at all.

# Security

The service is treated as internet-facing from commit one. Controls are enforced by gates (`pnpm sec:scan`, `pnpm log:scan`, lint) and by the byte-pinned platform kernel, not reviewer memory (BRS §16).

## Application controls

- **Input validation** — every external input crosses a zod schema at the boundary: route params/query/body via the registry's schemas, environment via `src/config/env.ts`. An unvalidated field never reaches a handler.
- **Error responses leak nothing** — every client-visible failure is a registered RFC 9457 problem type (`src/platform/problems.ts`); an unexpected throw is mapped to the generic `internal` problem, and the stack trace goes to the structured log, never the response.
- **Security headers** — the kernel sets them on every reply (`src/platform/headers.ts`): `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `X-Frame-Options: DENY`, a restrictive `Content-Security-Policy` for the JSON API. TLS termination and HSTS belong to the deployment edge — no local server speaks TLS.
- **Structured, redacting logging only** (NFR-12) — production code logs through the kernel's pino logger; `log:scan` fails a bare `console.*`, a direct stdout write outside the kernel, a `pino` import outside `src/platform`, and any log-call field named like PII (`password`, `token`, `authorization`, …).
- **Secrets** — none in the repo. Config via environment + `src/config/env.ts`.
- **SQL** — all persistence goes through drizzle's parameterised query builder in `src/adapters/out/persistence/`; no string-built SQL outside `db/migrations/`.

## Supply chain (BRS §4.2)

- Lockfile (`pnpm-lock.yaml`) committed and verified with `--frozen-lockfile` in CI (NFR-08/NFR-11).
- **Dependency budget** (NFR-13): `deps:budget` holds the runtime surface to a named allowlist (drizzle-orm, fastify, pg, pino, zod) under a ceiling of 8; `pnpm audit --prod --audit-level=high` fails the build on high/critical advisories.
- **SBOM**: every `sec:scan` emits a deterministic CycloneDX 1.5 JSON (`pnpm sbom` → `.proto-forge/sbom.cdx.json`, purl-sorted, no timestamp) from the installed production dep graph; CI uploads it as an artifact.
- **Seed integrity (BRS §17.2)**: `.proto-forge/seed.lock` pins the platform kernel (`src/platform/**`) and the gate corpus (`scripts/**`) by one sha256; `snapshot:diff` re-verifies it every run. Upgrades are explicit (`pnpm seed:lock` + ADR), and a local hook blocks kernel edits before they land.

## Reporting a vulnerability

Report privately through this repository's GitHub vulnerability reporting —
**Security → Report a vulnerability** on the repository page — and do not open a
public issue or attach a proof of concept to a pull request. If this repository is
not hosted on GitHub, replace this channel with the private one that applies;
`sec:conformance` fails when the section names no channel and no response window
(control `SEC-041`, SSDF RV.1.3).

| Step | Deadline |
| --- | --- |
| Acknowledgement of the report | 3 business days |
| Triage with a severity | 10 business days |
| Fix or documented mitigation for a confirmed high or critical finding | 30 days from triage |
| Fix for a confirmed medium or low finding | the next release |
| Coordinated disclosure | after the fix ships, or 90 days from the report, whichever is first |

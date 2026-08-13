# Security

The service is treated as internet-facing from commit one. Controls are enforced by gates (`pnpm sec:scan`, `pnpm log:scan`, ruff's bandit rules inside `pnpm lint`) and by the byte-pinned platform kernel, not reviewer memory (BRS §16).

## Application controls

- **Input validation** — every external input crosses a pydantic model at the boundary: route path/query/body via the endpoints' typed signatures (FastAPI rejects before any handler runs), environment via `src/app/config/env.py`. An unvalidated field never reaches a handler.
- **Error responses leak nothing** — every client-visible failure is a registered RFC 9457 problem type (`src/app/platform/problems.py`); an unexpected raise is mapped to the generic `internal` problem, and the cause goes to the structured log, never the response. The framework's default 422/HTTPValidationError surface is replaced by the registered `validation-failed` problem.
- **Security headers** — the kernel sets them on every reply (`src/app/platform/headers.py`): `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `X-Frame-Options: DENY`, `Cache-Control: no-store`, a deny-everything `Content-Security-Policy` for the JSON API; the problem responder repeats them on the one path outside the middleware stack. TLS termination and HSTS belong to the deployment edge — no local server speaks TLS.
- **Structured, redacting logging only** (NFR-12) — production code logs through the kernel's structlog logger; `log:scan` fails a bare `print(`, a direct stdout write outside the kernel, a `structlog`/`logging` wiring outside `src/app/platform`, and any log-call field named like PII (`password`, `token`, `authorization`, …); the kernel's `redact_pii` processor censors those fields before rendering.
- **Secrets** — none in the repo. Config via environment + `src/app/config/env.py`; alembic reads `DATABASE_URL` from the environment, never from a file; `gitleaks` scans the whole tree including `.prompts/`.
- **SQL** — all persistence goes through SQLAlchemy's parameterised expression language in `src/app/adapters/outbound/persistence/`; no string-built SQL anywhere, migrations included (alembic operations, not raw DDL strings).
- **SAST** — ruff runs the flake8-bandit (`S`) rule set over the whole tree inside `pnpm lint`; the gated rules have no inline `noqa` escape (`stub:scan` catches one).

## Supply chain (BRS §4.2)

- Lockfiles committed and verified frozen in CI: `uv.lock` (`uv sync --frozen`) for the app, `pnpm-lock.yaml` (`--frozen-lockfile`) for the gate corpus (NFR-08/NFR-11).
- **Dependency budget** (NFR-13): `deps:budget` holds the runtime surface to a named allowlist (alembic, fastapi, psycopg, pydantic, sqlalchemy, structlog, uvicorn) under a ceiling of 10; `pip-audit` over the uv-exported locked production set fails the build on known advisories, never auto-suppressed.
- **SBOM**: every `sec:scan` emits a deterministic CycloneDX 1.5 JSON (`pnpm sbom` → `.proto-forge/sbom.cdx.json`, purl-sorted, no timestamp) from the locked production closure in `uv.lock`; CI uploads it as an artifact.
- **Seed integrity (BRS §17.2)**: `.proto-forge/seed.lock` pins the platform kernel (`src/app/platform/**`) and the gate corpus (`scripts/**`) by one sha256; `snapshot:diff` re-verifies it every run. Upgrades are explicit (`pnpm seed:lock` + ADR), and a local hook blocks kernel edits before they land.

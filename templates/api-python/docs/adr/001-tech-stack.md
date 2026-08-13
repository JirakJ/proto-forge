# ADR 001: Technology stack

- Status: accepted
- Date: 2026-08-13
- Prompt-log: .prompts/0001-scaffold.md

## Context

The prototype must be a production-grade service slice: typed end to end, testable against a real database engine, contract-first at the boundary, and buildable with a pinned, reproducible toolchain (NFR-08, NFR-11). The gate corpus is Node everywhere (BRS §18), so the node runtime the gates need is a prerequisite regardless of stack.

## Decision

Python 3.12 (pinned via `.python-version` and `requires-python`), managed by uv with a committed `uv.lock`; CI installs with `uv sync --frozen`. FastAPI as the HTTP runtime, Pydantic v2 for every boundary model (the model IS the schema, BRS §12.2), SQLAlchemy 2 + Alembic for persistence against Postgres via psycopg 3, structlog for structured logging, uvicorn as the server. pytest + coverage.py (branch mode) for tests, mutmut for mutation testing, mypy `--strict` and ruff (including the flake8-bandit `S` rules) as the static layer, import-linter for the architecture contracts, Testcontainers Postgres as the real-engine tier (BRS §15/§19 — Python has no in-process Postgres). Exactly these seven runtime dependencies — alembic, fastapi, psycopg, pydantic, sqlalchemy, structlog, uvicorn — form the allowlist ADR 007 pins. pnpm with a committed lockfile drives the gate corpus.

## Consequences

One lockfile per toolchain is the reproducibility contract (uv.lock for the app, pnpm-lock.yaml for the gates). Strong typing from route model to database row. The dependency surface is small enough to audit by reading, and `deps:budget` keeps it that way. Node/pnpm and uv are prerequisites of the environment.

## Alternatives considered

Flask (no typed schema-first routing), Django + DRF (a framework runtime the dependency budget rejects), asyncpg + raw SQL (loses the typed model the migrations are checked against), pip/poetry (uv is one pinned binary doing resolver + venv + runner), unittest (pytest's fixture and coverage story is the ecosystem default).

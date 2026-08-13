# ADR 022: SQLAlchemy persistence adapter proven against a real engine

- Status: accepted
- Date: 2026-08-13
- Prompt-log: .prompts/0001-scaffold.md

## Context

The `NoteRepository` port (ADR 010) needs a real implementation whose SQL, constraints and ordering are exercised against real Postgres semantics, not inferred from a mock (ADR 003, BRS §15).

## Decision

`src/app/adapters/outbound/persistence/` implements the port with SQLAlchemy 2 over psycopg 3. The declarative model mirrors the committed alembic migrations (ADR 006), and the adapter's tests live in `tests/integration`: they apply those migrations to a Testcontainers Postgres and drive the adapter through real queries, including the ordering, constraint and not-found paths — plus the autogenerate-empty proof that model and migrations agree. Python has no in-process Postgres engine, so this tier is CI-mandatory and tool-gated locally (the BRS §15/§19 per-stack escape, recorded in ADR 003); the adapter is accordingly excluded from unit coverage with a reasoned omit entry, the one stack-specific exclusion this template carries. The engine seam is the only place a connection is constructed — and it pins the psycopg dialect, so a bare `postgresql://` URL cannot silently select a driver this project does not ship. No repository mock exists; the in-memory port fake in `__fixtures__` serves the application layer and the conformance boot with the same observable semantics.

## Consequences

"The adapter works" means "worked against Postgres semantics" on every CI run, and locally wherever Docker exists — the tool-gate says so out loud instead of green-washing. The cost is that a Docker-less laptop proves the adapter's tier last, in CI.

## Alternatives considered

Mocked repository tests (agree with the mock), SQLite in-memory (a different engine — dialect drift is exactly what it hides, BR-12), a served dev Postgres as a hard local requirement (fails BRS §15's offline-verify goal worse than the recorded escape does), asyncpg + async sessions (an async adapter under sync use-cases buys latency complexity the demo slice cannot justify).

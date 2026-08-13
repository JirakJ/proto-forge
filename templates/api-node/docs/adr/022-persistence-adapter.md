# ADR 022: Drizzle persistence adapter proven against a real engine

- Status: accepted
- Date: 2026-08-12
- Prompt-log: .prompts/0001-scaffold.md

## Context

The `NoteRepository` port (ADR 010) needs a real implementation whose SQL, constraints and ordering are exercised at verify time, not inferred from a mock (ADR 003, BRS §15).

## Decision

`src/adapters/out/persistence/` implements the port with drizzle-orm over pg. The Drizzle model mirrors the committed migrations (ADR 006), and the adapter's tests run those migrations against PGlite — actual Postgres in-process — then drive the adapter through real queries, including the ordering and not-found paths. The driver seam is the only place a connection is constructed, so the e2e boot and the unit suite swap engines without touching the adapter. This is the demo slice's adapter — a generated service replaces it per entity under the same doctrine.

## Consequences

"The adapter works" means "worked against Postgres semantics", on every verify, with no Docker requirement. The cost is PGlite as a dev dependency and a few seconds of engine startup in the suite.

## Alternatives considered

Mocked repository tests (agree with the mock), Testcontainers (real engine, Docker required everywhere), knex/raw SQL (loses the typed model the migrations are checked against).

# ADR 022: JPA persistence adapter proven against a real engine

- Status: accepted
- Date: 2026-08-13
- Prompt-log: .prompts/0001-scaffold.md

## Context

The `NoteRepository` port (ADR 010) needs a real implementation whose SQL, constraints and ordering are exercised against real Postgres semantics, not inferred from a mock (ADR 003, BRS §15).

## Decision

`app.adapter.out.persistence` implements the port with Spring Data JPA over PostgreSQL: `NoteEntity` mirrors the committed migrations (ADR 006), `NoteJpaRepository` carries the derived query that pins the total listing order (createdAt, then id), and `NoteRepositoryAdapter` maps rows to the domain record. The native tier (`PersistenceNativeTest`, tag `native`) boots the real application context against Testcontainers Postgres — Flyway migrates, hibernate validates, and the adapter is driven through real queries including the ordering and not-found paths. The port seam is the only place the application meets persistence, so the MockMvc slices swap in the in-memory fixture without touching the adapter. This is the demo slice's adapter — a generated service replaces it per entity under the same doctrine.

## Consequences

"The adapter works" means "worked against Postgres semantics" — in CI on every push, and locally wherever Docker exists (the tier is tool-gated on Docker, ADR 003/006). The cost is Testcontainers as a test dependency and container startup seconds in the native run.

## Alternatives considered

Mocked repository tests (agree with the mock), H2 in Postgres compatibility mode (a different engine's dialect wearing a flag — banned by BR-12's reasoning), JDBC templates with hand-written SQL (loses the typed entity model the migrations are checked against).

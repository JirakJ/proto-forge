# ADR 022: Exposed persistence adapter proven against a real engine

- Status: accepted
- Date: 2026-08-13
- Prompt-log: .prompts/0001-scaffold.md

## Context

The `NoteRepository` port (ADR 010) needs a real implementation whose SQL, constraints and ordering are exercised against real Postgres semantics, not inferred from a mock (ADR 003, BRS §15).

## Decision

`app.adapters.out.persistence` implements the port with JetBrains Exposed over PostgreSQL, pooled by HikariCP: `NotesTable` mirrors the committed migrations (ADR 006), and `ExposedNoteRepository` runs each operation in a transaction, with the listing order stated explicitly in the query (`createdAt` ascending, then `id`) so responses — and the captured docs examples derived from them — never depend on heap or insert order. `created_at` is carried by a ~20-line `TimestampTzColumnType` written in the adapter rather than by a whole Exposed date-time module: the dependency budget's cost, paid where it is visible (ADR 007).

The native tier (`PersistenceNativeTest`, tag `native`) runs the committed Flyway history against Testcontainers Postgres, reads the produced catalog back through JDBC metadata to prove the table and its column types match what `NotesTable` declares, and then drives the adapter through real queries including the timestamptz round trip, the total ordering and the not-found paths. The port seam is the only place the application meets persistence, so the `testApplication` slices swap in the in-memory fixture without touching the adapter. This is the demo slice's adapter — a generated service replaces it per entity under the same doctrine.

## Consequences

"The adapter works" means "worked against Postgres semantics" — in CI on every push, and locally wherever Docker exists (the tier is tool-gated on Docker, ADR 003/006). The cost is Testcontainers as a test dependency, container startup seconds in the native run, and one column type this template maintains itself.

## Alternatives considered

Mocked repository tests (agree with the mock), H2 in Postgres compatibility mode (a different engine's dialect wearing a flag — banned by BR-12's reasoning), Exposed's DAO layer (an entity lifecycle over the same SQL, and it would pull the domain toward the framework), raw JDBC with hand-written SQL (loses the typed table model the migrations are checked against).

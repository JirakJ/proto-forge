# ADR 022: EF Core persistence adapter proven against a real engine

- Status: accepted
- Date: 2026-08-13
- Prompt-log: .prompts/0001-scaffold.md

## Context

The `INoteRepository` port (ADR 010) needs a real implementation whose SQL, constraints and ordering are exercised against real Postgres semantics, not inferred from a mock (ADR 003, BRS §15).

## Decision

`src/App/Adapters/Out/Persistence` implements the port with EF Core 10 over Npgsql: `NoteEntity` mirrors the committed migrations (ADR 006) through explicit `[Table]`/`[Column]` names, `NotesDbContext` maps the one relation, and `NoteRepositoryAdapter` translates rows to the domain record while pinning the total listing order (createdAt, then id) so responses — and the captured docs examples derived from them — never depend on heap order. `DatabaseUrl` is the only place a connection string is constructed, translating the `postgres://` URL the environment carries into the provider's form. `NotesDbContextFactory` exists purely so the `dotnet-ef` tool can build the model at design time without opening a connection. The native tier (`PersistenceNativeTest`, trait `Category=native`) runs the committed history against Testcontainers Postgres, asserts the model has no pending changes, and drives the adapter through real queries including the ordering, round-trip and not-found paths. The port seam is the only place the application meets persistence, so the in-memory slices swap in the fixture repository without touching the adapter. This is the demo slice's adapter — a generated service replaces it per entity under the same doctrine.

## Consequences

"The adapter works" means "worked against Postgres semantics" — in CI on every push, and locally wherever Docker exists (the tier is tool-gated on Docker, ADR 003/006). The cost is Testcontainers as a test dependency and container startup seconds in the native run.

## Alternatives considered

Mocked repository tests (agree with the mock — and `stub:scan` fails a first-party substitute anywhere in the tree), the in-memory EF Core provider (a query engine with different semantics wearing the same API; banned by BR-12's reasoning), raw ADO.NET commands with hand-written SQL (loses the typed entity model the migrations are checked against).

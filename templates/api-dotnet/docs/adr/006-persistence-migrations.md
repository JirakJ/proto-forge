# ADR 006: Postgres via JPA, with append-only Flyway migrations that agree with the model

- Status: accepted
- Date: 2026-08-13
- Prompt-log: .prompts/0001-scaffold.md

## Context

A rewritten migration is a database whose past changed under it: every environment that already ran the old version now disagrees with every environment that runs the new one, silently (BR-24). And an entity model that drifts from the migrations describes a schema that does not exist.

## Decision

One engine: Postgres (a second engine is off-table, T22; H2 or any in-memory stand-in is a mock of a first-party boundary and is FORBIDDEN — BR-12/§15). The JPA entities in `app.adapter.out.persistence` are plain mappings over the schema the migrations produce; plain SQL migrations live in `src/main/resources/db/migration/VNNNN__name.sql` — Flyway's convention, zero-padded so the filename sort is the version sort, versions strictly increasing.

**The directory is history.** `migration:verify` pins every migration's sha256 in `.proto-forge/migrations.lock` and fails a changed or deleted file; `--write` appends new entries and REFUSES to re-pin an existing one, so regenerating the ledger can never launder a rewrite. A correction is a new migration. `DROP`/`TRUNCATE` require an `-- @adr NNN` marker in the file — destruction is a recorded decision.

**Model agreement is checked twice, at two costs.** Native-free on every verify: every table the migrations `CREATE` must appear in an entity's `@Table(name = …)` and every `@Table` must be produced by some migration — the name-level check catches the real failure without a JVM or a database. Natively in the real-database tier: `PersistenceNativeTest` boots the full context against Testcontainers Postgres, Flyway runs the committed history, and `spring.jpa.hibernate.ddl-auto=validate` makes hibernate prove the entities against the produced schema — column types included. **Docker is absent on some workstations (including the machine this template was built on): the native tier is tool-gated locally (`./gradlew nativeTest`, self-skipping without Docker) and mandatory in CI — recorded here in the spirit of the register's §19, exactly as api-python records the same escape.** Hibernate never edits the schema: `ddl-auto` is pinned to `validate`, and the application applies migrations through Flyway on startup; `pnpm db:migrate` applies the same files to a named database, idempotently.

## Consequences

Schema history is append-only and tamper-evident, exactly like the prompt log. The name-level model check is deliberately conservative — it catches a missing table, not a changed column type; the native tier catches the rest by running the real thing, on every push in CI. The cost is writing SQL by hand rather than generating it, which keeps every schema change reviewable.

## Alternatives considered

hbm2ddl update (implicit schema sync — the exact anti-pattern BR-24 bans), Liquibase (equivalent capability, XML ceremony the budget rejects; Flyway is the Boot-managed default), checksums in the database only (unverifiable in CI without a database; the lock is verifiable everywhere), H2/embedded stand-ins at verify time (asserts agreement with a different engine's dialect — rejected outright).

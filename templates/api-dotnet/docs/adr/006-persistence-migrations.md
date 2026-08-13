# ADR 006: Postgres via EF Core, with append-only migrations that agree with the model

- Status: accepted
- Date: 2026-08-13
- Prompt-log: .prompts/0001-scaffold.md

## Context

A rewritten migration is a database whose past changed under it: every environment that already ran the old version now disagrees with every environment that runs the new one, silently (BR-24). And an entity model that drifts from the migrations describes a schema that does not exist.

## Decision

One engine: Postgres (a second engine is off-table, T22; the in-memory EF Core provider or any embedded stand-in is a mock of a first-party boundary and is FORBIDDEN — BR-12/§15). The EF Core entities in `src/App/Adapters/Out/Persistence` are plain mappings over the schema the migrations produce; the migrations themselves are C# classes under `src/App/Adapters/Out/Persistence/Migrations/`, named `<14-digit UTC stamp>_<PascalCaseName>.cs` with their `.Designer.cs` twin — EF Core's convention, so the timestamp sort IS the version sort, strictly increasing and never reused.

**The directory is history.** `migration:verify` pins every migration's sha256 in `.proto-forge/migrations.lock` and fails a changed or deleted file; `--write` appends new entries and REFUSES to re-pin an existing one, so regenerating the ledger can never launder a rewrite. A correction is a new migration. `DropTable`/`DropColumn`/`DropIndex` and raw `DROP`/`TRUNCATE` require a `// @adr NNN` marker in the file — destruction is a recorded decision. `NotesDbContextModelSnapshot.cs` is the one file EF legitimately rewrites with every new migration, so it stays outside the append-only ledger; its agreement with the history is proven below rather than hashed.

**Model agreement is checked twice, at two costs.** Toolchain-free on every verify: every table the migrations `CreateTable` must appear in a `[Table("…")]` attribute under the persistence adapter, and every `[Table]` the entities declare must be produced by some migration — the name-level check catches the real failure without the .NET SDK or a database. Natively in the real-database tier: `PersistenceNativeTest` runs `Database.Migrate()` over the committed history inside Testcontainers Postgres and then asserts `HasPendingModelChanges()` is false — the same question `dotnet ef migrations has-pending-model-changes` asks, answered against the engine, column types included. **Docker is absent on some workstations (including the machine this template was built on): the native tier is tool-gated locally (`pnpm test:native`; the default unit run filters its `Category=native` trait out entirely) and mandatory in CI — recorded here per the register's §19.9, whose escape covers every stack with no in-process Postgres engine.** EF never invents a schema: there is no `EnsureCreated` anywhere, the application applies the committed migrations itself on startup, and `pnpm db:migrate` (`dotnet run --project src/App -- --migrate`) applies the same history to a named database through EF Core's transactional migrator, idempotently, for migrate-before-deploy pipelines.

## Consequences

Schema history is append-only and tamper-evident, exactly like the prompt log. The name-level model check is deliberately conservative — it catches a missing table, not a changed column type; the native tier catches the rest by running the real thing, on every push in CI. The cost is that a new migration is a generated pair of files plus a rewritten snapshot, all of which land in review together — which keeps every schema change readable as a diff.

## Alternatives considered

`EnsureCreated` or model-driven schema creation at startup (implicit schema sync — the exact anti-pattern BR-24 bans), hand-written SQL scripts driven by a separate migration runner (a second tool and a second history for a job EF Core already does against the model the adapter uses), checksums in the database only (unverifiable in CI without a database; the lock is verifiable everywhere), an embedded or in-memory stand-in at verify time (asserts agreement with a different engine's semantics — rejected outright).

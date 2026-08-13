# ADR 006: Postgres via drizzle, with append-only migrations that agree with the model

- Status: accepted
- Date: 2026-08-12
- Prompt-log: .prompts/0001-scaffold.md

## Context

A rewritten migration is a database whose past changed under it: every environment that already ran the old version now disagrees with every environment that runs the new one, silently (BR-24). And a model file that drifts from the migrations describes a schema that does not exist.

## Decision

One engine: Postgres (a second engine is off-table, T22). The Drizzle model in `src/adapters/out/persistence/db.ts` is plain TypeScript over the schema the migrations produce; plain SQL migrations live in `db/migrations/NNNN_name.sql`.

**The directory is history.** `migration:verify` pins every migration's sha256 in `.proto-forge/migrations.lock` and fails a changed or deleted file; `--write` appends new entries and REFUSES to re-pin an existing one, so regenerating the ledger can never launder a rewrite. A correction is a new migration. `DROP`/`TRUNCATE` require an `-- @adr NNN` marker in the file — destruction is a recorded decision.

**Model agreement is checked mechanically**: every table the migrations `CREATE` must appear in the model, and every `pgTable(...)` must be produced by some migration. At verify time the unit suite executes the committed migrations against PGlite — actual Postgres in-process (BRS §15) — and drives the adapter through real SQL, so "the migrations produce the schema the model expects" is exercised, not inferred. `pnpm db:migrate` applies the same files to a real database, one transaction per file, idempotently.

## Consequences

Schema history is append-only and tamper-evident, exactly like the prompt log. The name-level model check is deliberately conservative — it catches a missing table, not a changed column type; the PGlite suite catches the rest by running the real thing. The cost is writing SQL by hand rather than generating it, which keeps every schema change reviewable.

## Alternatives considered

drizzle-kit push (implicit schema sync — the exact anti-pattern BR-24 bans), generated migrations with checksums in a database table only (unverifiable in CI without a database; the lock is verifiable everywhere), mocking persistence at verify time (asserts agreement with the mock).

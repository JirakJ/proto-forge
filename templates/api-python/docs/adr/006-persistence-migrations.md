# ADR 006: Postgres via SQLAlchemy, with append-only alembic migrations that agree with the model

- Status: accepted
- Date: 2026-08-13
- Prompt-log: .prompts/0001-scaffold.md

## Context

A rewritten migration is a database whose past changed under it: every environment that already ran the old version now disagrees with every environment that runs the new one, silently (BR-24). And a model file that drifts from the migrations describes a schema that does not exist.

## Decision

One engine: Postgres (a second engine is off-table, T22). The SQLAlchemy model in `src/app/adapters/outbound/persistence/db.py` is plain declarative Python over the schema the migrations produce; alembic migrations live in `alembic/versions/NNNN_name.py` with hand-readable, sequential revision ids.

**The directory is history.** `migration:verify` pins every migration's sha256 in `.proto-forge/migrations.lock` and fails a changed or deleted file; `--write` appends new entries and REFUSES to re-pin an existing one, so regenerating the ledger can never launder a rewrite. A correction is a new migration. `op.drop_*`/`TRUNCATE` require a `# @adr NNN` marker in the file — destruction is a recorded decision.

**Model agreement is checked twice.** The name-level half runs on every `pnpm verify`, native-free: every table the migrations `op.create_table` must appear in the model, and every `__tablename__` must be produced by some migration. The schema-level half is alembic's autogenerate against a real Postgres — after `alembic upgrade head`, `compare_metadata` must find an EMPTY diff — exercised by `tests/integration` and `gates:selftest:native` in CI (Python has no in-process engine; the BRS §15/§19 escape is recorded in ADR 003). `pnpm db:migrate` applies the same history to a real database via `alembic upgrade head`, idempotently.

## Consequences

Schema history is append-only and tamper-evident, exactly like the prompt log. The name-level model check is deliberately conservative — it catches a missing table, not a changed column type; the CI integration tier catches the rest by running the real thing. The cost is that the column-level agreement proof waits for CI on a Docker-less laptop, which the tool-gate says out loud rather than hiding.

## Alternatives considered

Alembic autogenerate-and-apply on boot (implicit schema sync — the exact anti-pattern BR-24 bans), hash-based revision ids (unreadable history; sequential ids keep review diffs ordered), checksums in a database table only (unverifiable in CI without a database; the lock is verifiable everywhere), mocking persistence at verify time (asserts agreement with the mock).

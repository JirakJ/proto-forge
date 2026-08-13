# ADR 003: Total coverage, mutation testing, and a real database engine — with the Python escape recorded

- Status: accepted
- Date: 2026-08-13
- Prompt-log: .prompts/0001-scaffold.md

## Context

Three failure modes make service test suites lie. A coverage floor below 100 on the layer where the product logic lives is a standing licence for untested behaviour exactly where it changes most. 100 % line coverage proves every line ran, not that any assertion would notice a line changing. And a persistence adapter tested against a mock of the database asserts the adapter agrees with the mock — SQL, constraints and ordering stay unproven until production.

BRS §15 wants the real engine in-process at verify time; Python has no PGlite equivalent — there is no maintained actual-Postgres-in-process for CPython. §15 provides the escape itself: *where a stack has no in-process engine, the real-database tier is Testcontainers in CI, recorded per stack in §19*. This ADR is that record for api-python.

## Decision

**Coverage is 100 with branch mode on the whole measured set** — `src/app/domain`, `src/app/application`, `src/app/adapters/inbound`, `src/app/platform`, `src/app/config` — and the configuration is part of the contract: `coverage:policy` fails a `fail_under` below 100 and any `omit` entry that is not on its allow-list with the stated reason above it. Because coverage.py has no per-glob thresholds, the contract is stated by scoping: the omit list is the allow-list, and an aggregate of 100 over the measured set IS 100 on every measured file (the gate re-proves this per file whenever `coverage/coverage.json` is present). The exclusions are categories, not files: fixtures, the bootstrap entry, the scenario catalogue, the e2e composition roots — and ONE stack-specific entry, the persistence adapter, excluded from unit coverage because its tier is below.

**The real-database tier is Testcontainers Postgres, mandatory in CI, tool-gated locally.** `tests/integration` applies the committed alembic migrations to a real Postgres container and drives the SQLAlchemy adapter through real SQL — constraints, ordering, not-found paths — plus the schema-level model-agreement proof (`alembic check` / autogenerate-empty). Without a Docker daemon the tier SKIPS locally with a loud note; in CI its absence is a hard failure. No repository mock exists for the real adapter; the in-memory port fake in `__fixtures__` serves the application layer and the e2e conformance boot, with the same observable semantics.

**`pragma: no cover` comments are a registry, currently empty.** An ignore must state a reason of substance and name the harness case covering the branch in the conformance run (`[covered-by: <case-id>]`), and the total count is pinned in the committed snapshot (`ignores` gate).

**Mutation testing proves the assertions fire** (`test:mutation`, mutmut, break 85 — the Python floor from NFR-14, ratchet-only; the floor lives in `pyproject.toml [tool.proto-forge.mutation]` and the gate computes the score strictly: an uncovered or suspicious mutant counts against it). The mutated scope is the behavioural core: `src/app/domain` and `src/app/application`. Transport plumbing (FastAPI wiring, the structlog transport) has a different oracle — the conformance suite replaying real exchanges — and mutating it would make the score measure how much plumbing a file contains.

**Fixtures are built from the model they must not drift from.** `define_factory(model, defaults)` parses every produced value; `stub:scan` rejects a `__fixtures__` export that is bare literal data. The e2e conformance run (`test:e2e`) stays a separate pass/fail gate outside the percentage.

## Consequences

"Fully tested" is three mechanical claims — every line and branch runs, every assertion bites, every fixture is domain-valid — each with a gate and each with a demonstrated failure case (`gates:selftest` Tier 1 for the .mjs gates, `gates:selftest:native` Tier 2 for the native ones). The cost of the Testcontainers escape is honest: `pnpm verify` on a Docker-less laptop proves everything except live Postgres semantics, and CI closes that gap on every push.

## Alternatives considered

**Layered floors** — under-protects the layer that changes most. **SQLite for adapter tests** — not Postgres; an in-memory reimplementation of the target engine is a mock of a first-party boundary (BR-12), and dialect drift is exactly what it hides. **pglite via a WASM bridge** — no maintained Python binding; a vendored bridge would be our own unproven engine. **Mocking the repository in adapter tests** — the mock agrees with the mock. **Mutating everything** — scores plumbing, not behaviour; the narrowed scope is recorded here instead of silently configured.

# ADR 003: Total coverage, mutation testing, and a real database engine at verify time

- Status: accepted
- Date: 2026-08-12
- Prompt-log: .prompts/0001-scaffold.md

## Context

Three failure modes make service test suites lie. A coverage floor below 100 on the layer where the product logic lives is a standing licence for untested behaviour exactly where it changes most. 100 % line coverage proves every line ran, not that any assertion would notice a line changing. And a persistence adapter tested against a mock of the database asserts the adapter agrees with the mock — SQL, constraints and ordering stay unproven until production.

## Decision

**Coverage is 100/100/100/100 on every glob** (`src/domain`, `src/application`, `src/adapters`, `src/platform`, `src/config`), and the configuration is part of the contract: `coverage:policy` fails on any threshold below 100 and on any exclusion that is not on its allow-list with the stated reason on the line above. The exclusions are categories, not files: tests and fixtures, test infrastructure, the bootstrap entry (covered by the conformance run), and the scenario catalogue. A line that genuinely cannot be reached is a design problem to fix, never a threshold problem to lower.

**`v8 ignore` comments are a registry, currently empty.** An ignore must state a reason of substance and name the harness case covering the branch in the conformance run (`[covered-by: <case-id>]`), and the total count is pinned in the committed snapshot (`ignores` gate).

**Mutation testing proves the assertions fire** (`test:mutation`, Stryker, `break: 90` — the Node floor from NFR-14, ratchet-only). The mutated scope is the behavioural core: `src/domain/**`, `src/application/**` and the problem catalogue `src/platform/problems.ts`. Transport plumbing (Fastify wiring, the pino transport) has a different oracle — the conformance suite replaying real exchanges — and mutating it would make the score measure how much plumbing a file contains.

**The persistence adapter is tested against a real engine.** PGlite runs actual Postgres in-process (BRS §15): the unit suite executes the committed migrations against it and drives the Drizzle adapter through real SQL — constraints, ordering and errors included. No repository mock exists for the real adapter; the in-memory port fake in `__fixtures__` serves the application layer, with the same observable semantics.

**Fixtures are built from the schema they must not drift from.** `defineFactory(schema, defaults)` parses every produced value; `stub:scan` rejects a `__fixtures__` export that is bare literal data. The e2e conformance run (`test:e2e`) stays a separate pass/fail gate outside the percentage.

## Consequences

"Fully tested" is three mechanical claims — every line runs, every assertion bites, every fixture is domain-valid — each with a gate and each with a demonstrated failure case in `gates:selftest`. The cost is wall time (mutation adds tens of seconds, incremental thereafter) and the occasional refactor forced by reachability.

## Alternatives considered

**Layered floors** — under-protects the layer that changes most. **Testcontainers for Postgres** — a real engine too, but needs Docker in every environment; PGlite needs nothing. **Mocking the repository in adapter tests** — the mock agrees with the mock. **Mutating everything** — scores plumbing, not behaviour; the narrowed scope is recorded here instead of silently configured.

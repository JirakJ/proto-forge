# ADR 003: Total coverage, mutation testing, and fixtures built from schemas

- Status: accepted
- Date: 2026-08-12
- Prompt-log: .prompts/0001-scaffold.md

## Context

The previous strategy layered coverage floors by architectural boundary — 100 % for the
library and domain, 85/80 for features, 80/75 for the app shell — on the reasoning that a
flat threshold forces worthless tests on trivial code. Three problems accumulated against
it:

- The under-protected layer was exactly where the product logic lives. A feature branch
  at 80 % is a standing licence for untested behaviour in the code that changes most.
- 100 % line coverage proves every line ran, not that any assertion would notice the line
  changing. A test that executes code without asserting its effect counts the same as one
  that pins it.
- Hand-written fixtures agree with the domain on the day they are written. When a schema
  narrows, stale literals keep passing the tests they appear in while representing values
  the domain would reject.

## Decision

**Coverage is 100/100/100/100 on every glob**, and the configuration is part of the
contract: `coverage:policy` fails in CI on any threshold below 100 and on any exclusion
that is not on its allow-list with the stated reason on the line above. The exclusions are
few and each is a category, not a file: tests and fixtures, test infrastructure, the
bootstrap entry (covered end-to-end), the harness catalogue (never in a production build),
and declarations. A pure-interface module needs no exclusion — it has zero executable
statements and passes vacuously. A line that genuinely cannot be reached is a design
problem to fix, never a threshold problem to lower.

**`v8 ignore` comments are a registry, currently empty.** An ignore must state a reason of
substance and name the harness case covering the branch in a real browser
(`[covered-by: <case-id>]`), and the total count is pinned in the committed snapshot — so
the population can only change as a reviewed diff (`ignores` gate).

**Mutation testing proves the assertions fire** (`test:mutation`, Stryker, `break: 90`).
The mutated scope is the behavioural core — `packages/proto-ui/src/overlay/**`,
`packages/proto-ui/tokens.ts`, `src/domain/**` — a deliberate narrowing recorded in the
requirements register §3.2: mutations of presentational literals (style strings, hook
dependency arrays) are unassertable by a behaviour-first suite on purpose, because
appearance has a different oracle — the browser suite's geometry, hit tests, axe and
screenshots. Counting them would make the score measure how much styling a file contains.

**Fixtures are built from the schema they must not drift from.** `defineFactory(schema,
defaults)` parses every produced value, so a drifted default fails at the call site with
zod naming the field; sequences are deterministic and reset per test. `stub:scan` rejects
a `__fixtures__` export that is not a factory, a schema, or a type. Component
*configuration* (menu items with callbacks, tabs with JSX) is not fixture data — its
schema is the component's own props, enforced by the type checker.

Tests keep asserting **behaviour**: Testing Library roles and testids, no `vi.mock` of
first-party modules, and E2E stays a separate pass/fail gate outside the percentage.

## Consequences

"Fully tested" is now three mechanical claims — every line runs (coverage), every
assertion bites (mutation), every fixture is domain-valid (factories) — each with a gate
and each with a demonstrated failure case. The mutation run earned its keep on day one:
three surviving mutants in the core were real assertion gaps, including a fixture that
used the same bytes the code would write, making an unconditional overwrite invisible.

The cost is wall time (`test:mutation` adds ~90 s, incremental thereafter) and the
occasional refactor forced by reachability — an initialiser that cannot be tested gets
restructured rather than excluded.

## Alternatives considered

**Layered floors** — the previous decision; under-protects the layer that changes most.
**Flat 100 % without mutation** — proves execution, not assertion; gameable by tests with
no expectations. **Mutating all of `packages/proto-ui`** — scored 74 % with the survivors
dominated by unassertable presentational literals; recorded in the register rather than
silently narrowed. **Snapshot-testing components to pin appearance** — pins today's markup
bytes, fails on every intentional change, and still asserts nothing about behaviour.

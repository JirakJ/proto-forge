# ADR 003: Total core coverage, mutation testing, and a real database engine in a tool-gated tier

- Status: accepted
- Date: 2026-08-13
- Prompt-log: .prompts/0001-scaffold.md

## Context

Three failure modes make service test suites lie. A coverage floor below 100 on the layers where the product logic lives is a standing licence for untested behaviour exactly where it changes most. 100 % line coverage proves every line ran, not that any assertion would notice a line changing. And a persistence adapter tested against a mock of the database asserts the adapter agrees with the mock — SQL, constraints and ordering stay unproven until production.

## Decision

**Coverage is 1.00/1.00/1.00 (INSTRUCTION/BRANCH/LINE) per package on the behavioural core** — `app.domain` and `app.application`, every subpackage — enforced by `jacocoTestCoverageVerification`, and the configuration is part of the contract: `coverage:policy` fails a lowered minimum, a rule that stops covering the core packages, and any `classDirectories` exclusion that is not on its allow-list with the stated reason on the line above. The exclusions are the composition roots only (Application, Wiring, MigrateMain — covered by the conformance run). The web and persistence adapters are exercised end-to-end (MockMvc conformance, the native tier) rather than chased to a percentage; the JaCoCo rule binds the core, which is where BRS §3.1's argument bites hardest per changed line.

**`jacoco ignore` markers are a registry, currently empty.** An ignore must state a reason of substance and name the harness case covering the branch in the conformance run (`[covered-by: <case-id>]`), and the total count is pinned in the committed snapshot (`ignores` gate).

**Mutation testing proves the assertions fire** (`test:mutation`, PIT, `mutationThreshold = 85` — the JVM floor from NFR-14, ratchet-only, reflecting PIT's weaker operator set against Stryker's 90). The mutated scope is the behavioural core: `app.domain.*` and `app.application.*`, driven by their own unit suites. Transport plumbing (the registrar, the advice, the JPA adapter) has a different oracle — the conformance suite and the native tier replaying real exchanges — and mutating it would make the score measure how much plumbing a class contains.

**The persistence adapter is tested against a real engine, in a tool-gated tier.** The JVM has no in-process real-Postgres equivalent of PGlite, so the real-database tier is Testcontainers (BRS §15's stated fallback, recorded here in the spirit of §19): `PersistenceNativeTest` (tag `native`, `./gradlew nativeTest`) boots the REAL application context against `postgres:16-alpine` — Flyway migrates, hibernate validates, the adapter runs real SQL. **Docker is absent on some workstations (including the machine this template was built on), so the tag is excluded from `test` and the class skips itself without Docker; CI runs `nativeTest` unconditionally on a Docker-equipped runner — tool-gated locally, hard in CI, exactly the sec-scan precedent.** No repository mock exists anywhere: the in-memory port fake in the `app.fixtures` test package serves the application layer and the MockMvc slices, with the same observable semantics, and is itself never a stand-in for the adapter.

**Fixtures are built from the constraints they must not drift from.** `Factory.defineFactory(defaults)` validates every produced value through jakarta-validation; `stub:scan` rejects a fixtures-package field that is bare literal data. The e2e conformance run (`test:e2e`) stays a separate pass/fail gate outside the percentage.

**Selftests are two-tier** (BRS §18): Tier 1 (`gates:selftest`) proves every `.mjs` gate on fixture directories in seconds, JVM-free, with the case-name set byte-identical to api-node's; Tier 2 (`gates:selftest:native`, CI-only) builds throwaway Gradle projects and proves the NATIVE halves fire — ArchUnit rejects an illegal import, the JaCoCo rule rejects an uncovered branch, `flyway validate` rejects a drifted migration — the §19.4/§19.7 precedent, with the tier named explicitly.

## Consequences

"Fully tested" is three mechanical claims — every core line runs, every core assertion bites, every fixture is domain-valid — each with a gate and each with a demonstrated failure case. The costs: wall time for PIT (seconds at this size), and the real-database proof landing in CI rather than on a Docker-less workstation — a machine without Docker runs everything else and CI closes the gap on every push.

## Alternatives considered

**Layered 100 on every package** — chases percentages on Spring plumbing whose oracle is the conformance run, and (unlike vitest) JaCoCo cannot count MockMvc-slice execution against a second suite cheaply. **An embedded/H2 stand-in for Postgres** — a mock of a first-party boundary wearing a JDBC url; banned by BR-12/§15 and rejected outright. **Mocking the repository in adapter tests** — the mock agrees with the mock. **Mutating everything** — scores plumbing, not behaviour; the narrowed scope is recorded here instead of silently configured.

# ADR 007: The dependency budget is a ceiling with a name on it

- Status: accepted
- Date: 2026-08-13
- Prompt-log: .prompts/0001-scaffold.md

## Context

The web template budgets what it ships to a browser. A service ships nothing to a browser, but its analogue of bundle weight is dependency surface: every runtime dependency is supply-chain risk, audit surface and upgrade debt. Latency budgets are environment noise; dependency count is deterministic (NFR-13).

## Decision

`deps:budget` enforces two things over the `implementation`/`runtimeOnly` declarations in `build.gradle.kts`:

1. a **count ceiling of 10**;
2. a **named allowlist** — ktor-server-core, ktor-server-netty, ktor-server-status-pages, kotlinx-serialization-json, exposed-core, exposed-jdbc, HikariCP, flyway-database-postgresql, postgresql, logback-classic (the ADR 001 stack). A dependency outside the list fails with instructions: a new runtime dependency is an ADR, and the ADR's diff includes the allowlist edit in the gate itself.

**The template ships all ten, so the headroom is zero — deliberately, and worth stating.** Ktor is fine-grained where a Spring starter is coarse: the java template's six declarations resolve to a far larger tree, and this one's ten resolve to a smaller one. Counting declarations still measures the right thing (how many decisions a reviewer has to hold), but at this granularity the ceiling binds immediately, and the honest reading is "adding an eleventh runtime dependency to this service requires an ADR from day one" rather than "there is room for three more". One declaration does double duty on purpose: `flyway-database-postgresql` api-exposes `flyway-core`, which is one decision — "Flyway, for PostgreSQL" — the same way a starter is one decision.

Declared dependencies are the unit: the transitive tree is pinned in `gradle.lockfile` and audited by `sec:scan` (osv-scanner over the lock). Test-scoped dependencies are out of scope — they never reach production, and the Ktor test host, ArchUnit and Testcontainers are testImplementation BY DESIGN. Exceeding the ceiling is remediated by removing weight, never by raising the number. `consistency` adds the node-side corollary: the gate corpus is dependency-free, so any package.json runtime dependency no gate script imports fails as dead weight.

## Consequences

The dependency review happens at the moment of addition, in a diff that names the decision, instead of at the yearly audit. The cost is friction when a library would genuinely help — which is the mechanism working — and, at zero headroom, that friction starts on the first addition. Two places in this template already pay it and say so: the `timestamptz` column type written by hand instead of pulling `exposed-java-time` (ADR 006), and the request validation written as domain functions instead of pulling a validation framework (ADR 010).

## Alternatives considered

**A ceiling of 12 to buy headroom** — the number would then be chosen to fit the template rather than to bind it, which is how a budget stops being one. **Counting the resolved transitive graph** (environment-stable but enormous and meaningless as a decision unit; the lock + audit cover it), **installed-size ceilings** (platform-dependent, nondeterministic), **no allowlist with count only** (ten guavas pass), **auditing at release time** (too late — the dependency is load-bearing by then).

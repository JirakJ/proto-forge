# ADR 007: The dependency budget is a ceiling with a name on it

- Status: accepted
- Date: 2026-08-13
- Prompt-log: .prompts/0001-scaffold.md

## Context

The web template budgets what it ships to a browser. A service ships nothing to a browser, but its analogue of bundle weight is dependency surface: every runtime dependency is supply-chain risk, audit surface and upgrade debt. Latency budgets are environment noise; dependency count is deterministic (NFR-13).

## Decision

`deps:budget` enforces two things over the `implementation`/`runtimeOnly` declarations in `build.gradle.kts`:

1. a **count ceiling of 10** — the template ships 6, leaving headroom for a brief's real needs (an auth starter, a queue client, an external SDK) without ever letting "add a dependency" become the path of least resistance;
2. a **named allowlist** — spring-boot-starter-web, spring-boot-starter-data-jpa, spring-boot-starter-validation, flyway-core, flyway-database-postgresql, postgresql (the ADR 001 stack). A dependency outside the list fails with instructions: a new runtime dependency is an ADR, and the ADR's diff includes the allowlist edit in the gate itself.

Declared dependencies are the unit on purpose: a starter is one reviewed decision, and its transitive tree is pinned in `gradle.lockfile` and audited by `sec:scan` (osv-scanner over the SBOM built from the lock). Test-scoped dependencies are out of scope — they never reach production, and springdoc in particular is testImplementation BY DESIGN (ADR 008). Exceeding the ceiling is remediated by removing weight, never by raising the number; a genuine budget change is an ADR. `consistency` adds the node-side corollary: the gate corpus is dependency-free, so any package.json runtime dependency no gate script imports fails as dead weight.

## Consequences

The dependency review happens at the moment of addition, in a diff that names the decision, instead of at the yearly audit. The cost is friction when a library would genuinely help — which is the mechanism working.

## Alternatives considered

Counting the resolved transitive graph (Boot's BOM makes the number environment-stable but enormous and meaningless as a decision unit; the lock + audit cover it), installed-size ceilings (platform-dependent, nondeterministic), no allowlist with count only (ten guavas pass), auditing at release time (too late — the dependency is load-bearing by then).

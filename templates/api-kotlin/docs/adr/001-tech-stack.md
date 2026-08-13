# ADR 001: Technology stack

- Status: accepted
- Date: 2026-08-13
- Prompt-log: .prompts/0001-scaffold.md

## Context

The prototype must be a production-grade service slice: typed end to end, testable against a real database engine, contract-first at the boundary, and buildable with a pinned, reproducible toolchain (NFR-08, NFR-11). The gate corpus is Node everywhere (BRS §18), so node+pnpm are prerequisites regardless of stack.

## Decision

JDK 21 (Kotlin `jvmToolchain(21)`) built by a **checksum-pinned Gradle wrapper** (8.14.3, `distributionSha256Sum` committed) — the wrapper is the only build entrypoint, and `gradle.lockfile` (dependencyLocking over all configurations, written by `./gradlew dependencies --write-locks`) locks every resolved coordinate; CI resolves in locked mode, so a resolution the lock does not name is a failure, not an update. **Kotlin 2.2.21 exact**, with `explicitApi = Strict` and `allWarningsAsErrors` — the public surface of this service is written down rather than inferred, and `lint`/`typecheck` are compiles with teeth.

**Ktor 3.2.4** is the HTTP runtime, on the Netty engine, with `StatusPages` for the problem surface. It was chosen over Spring Boot deliberately: Ktor ships what you install and nothing else, which is what makes the platform kernel in `app.platform` a readable ~200 lines instead of a configuration dialect. **kotlinx.serialization** carries the wire types — the `SerialDescriptor` a domain type declares IS the schema (BRS §12.2), and the OpenAPI emitter reads exactly that. Persistence is **JetBrains Exposed 1.4.0** (Kotlin-native SQL DSL) over **HikariCP**, with **Flyway** for append-only migrations and the **PostgreSQL** JDBC driver. Logging is SLF4J with **Logback**, always behind the kernel's redacting `AppLogger`.

Testing is **kotlin.test on JUnit 5** with Ktor's `testApplication` (in-memory engine, no socket) for the HTTP slices, **JaCoCo** per-package verification, **PIT** for mutation testing, **ArchUnit** for the JVM half of the architecture profile, and **Testcontainers-Postgres** for the real-database tier. Lint is **detekt 1.23.8** on top of its default rule set, with every deviation stated and reasoned in `config/detekt.yml`. **Exactly ten declared runtime dependencies** form the allowlist ADR 007 pins. Node 22 + pnpm (pinned via `.nvmrc`/`engines`/`packageManager`, committed `pnpm-lock.yaml`) carry the gate corpus; the only npm packages are the two dev tools the gates shell out to (husky, jscpd) — the `.mjs` corpus itself is dependency-free.

## Consequences

Two lockfiles are the reproducibility contract: `gradle.lockfile` for the service, `pnpm-lock.yaml` for the gate corpus. Strong typing from route registry to database row, with no annotation-processing step anywhere. The declared dependency surface is small enough to audit by reading, and `deps:budget` keeps it that way — though Ktor's fine-grained artifacts spend the whole budget, which ADR 007 records. JDK/node/pnpm are prerequisites of the environment.

## Alternatives considered

**Spring Boot** (the operator's explicit non-choice: a bigger managed baseline, but the kernel becomes framework configuration and the contract needs springdoc to introspect a booted context). **Maven** (no first-class dependency locking; the wrapper checksum pin is weaker). **Micronaut/Quarkus** (annotation processing and a smaller Kotlin-first story than Ktor). **Hibernate/JPA for persistence** (a second programming model over the same SQL, and its schema autogeneration is the anti-pattern BR-24 bans; Exposed's DSL is a thin, explicit layer). **ktlint instead of detekt** (formatting only — detekt covers the correctness rules this template actually gates on).

# ADR 001: Technology stack

- Status: accepted
- Date: 2026-08-13
- Prompt-log: .prompts/0001-scaffold.md

## Context

The prototype must be a production-grade service slice: typed end to end, testable against a real database engine, contract-first at the boundary, and buildable with a pinned, reproducible toolchain (NFR-08, NFR-11). The gate corpus is Node everywhere (BRS §18), so node+pnpm are prerequisites regardless of stack.

## Decision

JDK 21 (Gradle toolchain) built by a **checksum-pinned Gradle wrapper** (8.14.3, `distributionSha256Sum` committed) — the wrapper is the only build entrypoint, and `gradle.lockfile` (dependencyLocking over all configurations, written by `./gradlew dependencies --write-locks`) locks every resolved coordinate; CI resolves in locked mode, so a resolution the lock does not name is a failure, not an update. Spring Boot **3.5.16 exact** with `io.spring.dependency-management` 1.1.7. Spring MVC (starter-web) as the HTTP runtime, jakarta-validation constraints as the domain schema (the constraints ARE the model, BRS §12.2), Spring Data JPA over PostgreSQL for persistence, Flyway for append-only migrations, SLF4J/Logback behind the kernel's redacting `AppLogger`. JUnit 5 with JaCoCo per-package verification, PIT for mutation testing, springdoc-openapi in a **test slice only** for contract emission, Testcontainers-Postgres for the real-database tier, ArchUnit for the JVM half of the architecture profile. Exactly six declared runtime dependencies — spring-boot-starter-web, spring-boot-starter-data-jpa, spring-boot-starter-validation, flyway-core, flyway-database-postgresql, postgresql — form the allowlist ADR 007 pins. osv-flagged transitives are pinned above their patched floors via BOM version-property overrides plus one Gradle constraint, each annotated with its advisory id in `build.gradle.kts` (the pnpm-workspace.yaml overrides convention, restated). Node 22 + pnpm (pinned via `.nvmrc`/`engines`/`packageManager`, committed `pnpm-lock.yaml`) carry the gate corpus; the only npm packages are the two dev tools the gates shell out to (husky, jscpd) — the `.mjs` corpus itself is dependency-free.

## Consequences

Two lockfiles are the reproducibility contract: `gradle.lockfile` for the service, `pnpm-lock.yaml` for the gate corpus. Strong typing from route registry to database row. The declared dependency surface is small enough to audit by reading, and `deps:budget` keeps it that way. JDK/node/pnpm are prerequisites of the environment.

## Alternatives considered

Maven (no first-class dependency locking; the wrapper checksum pin is weaker), Quarkus/Micronaut (smaller ecosystems for the register's gate set; Boot's BOM is the strongest managed baseline), Hibernate hbm2ddl for schema (implicit sync — the exact anti-pattern BR-24 bans), Gradle version catalogs without locking (ranges stay floating).

## Subsequent stack amendment

ADR 203 upgrades the Spring Boot, Spring Framework, Jackson and Tomcat versions and replaces the Flyway core declaration with the Boot Flyway starter. The original decision above is retained as history; ADR 203 records the current stack.

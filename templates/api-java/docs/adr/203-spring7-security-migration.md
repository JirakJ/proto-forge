# ADR 203: Move the Java service template to the patched Spring 7 stack

- Status: accepted
- Date: 2026-10-20
- Prompt-log: .prompts/0002-spring7-security-migration.md

## Context

The recursive workspace scan reports GHSA-j9f9-w8pj-32f8 and GHSA-pc63-qcmh-9cmg in Spring MVC 6.2.19. The publisher lists Spring 7.0.9 as the free fixed release; Spring 6.2.20 requires Enterprise support. Paying for an Enterprise subscription is outside this task.

## Decision

Use Spring Boot 4.0.8, which manages Spring 7.0.9. Preserve JDK 21 and the existing quality thresholds. Pin Jackson 3 at 3.1.7, the compatibility Jackson 2 BOM at 2.22.3, and Tomcat at 11.0.25 to preserve the previously enforced security floors in the new dependency graph.

Replace the declared runtime dependency flyway-core with spring-boot-starter-flyway. Boot 4 modularized Flyway auto-configuration: keeping only flyway-core would stop automatic migration on application startup. This remains six declared runtime dependencies. Replace only that entry in scripts/deps-budget.mjs; keep the ceiling of ten and all other checks.

Update test imports for Boot 4 and Jackson 3, use the Testcontainers 2 artifact names and PostgreSQLContainer package, and keep the committed API contract unchanged. Regenerate Gradle locks and the runtime SBOM using their existing tools.

Applying this proposal also requires an explicit upgrade of the byte-pinned gate corpus: run the existing seed-lock generator, then regenerate the structural snapshot. The platform kernel, gate modes, coverage floors, mutation floor, waiver list, and advisory ignore files stay unchanged. This proposal does not authorize a commit or publication.

## Validation already performed in an isolated copy

- Gradle compile, unit tests, JaCoCo verification and assemble passed.
- API contract verification matched the existing committed contract.
- All nine conformance scenarios passed.
- PIT killed all eight generated mutants (100%).
- OSV scanned the Gradle lock, pnpm lock and 86-component runtime SBOM with zero findings and no extraction errors.
- Native PostgreSQL tests were not run: Docker is not installed.
- The dependency-budget gate correctly refuses the replacement starter until its protected allowlist is updated. The operator subsequently approved the protected allowlist replacement and generated seed upgrade.

## Consequences

This is a major framework migration and needs review despite unchanged HTTP behavior in the verified test tiers. A Docker-equipped environment must still run the native persistence tier. Existing tests and quality floors remain mandatory.

## Sources

- https://spring.io/security/cve-2026-47890/
- https://spring.io/security/cve-2026-47884/
- https://github.com/spring-projects/spring-boot/wiki/Spring-Boot-4.0-Migration-Guide
- https://repo.maven.apache.org/maven2/org/springframework/boot/spring-boot-dependencies/4.0.8/spring-boot-dependencies-4.0.8.pom

## Approval

The operator explicitly approved applying the prepared migration, including the protected dependency allowlist and generated seed lock, on 20 October 2026. No commit or publication was requested.

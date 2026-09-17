---
id: 0001
timestamp: 2026-08-13T00:00:00Z
phase: 1
adr: 001
author: proto-forge
model: claude-fable-5-1
---

## Prompt

Scaffold the fixed proto-forge api-java template: pinned JDK 21 + Spring Boot 3.5.x stack built by a checksum-pinned Gradle wrapper with locked dependencies, the byte-pinned platform kernel (problems catalogue, redacting SLF4J kernel logger, security headers filter, health), complexity-derived architecture profiles enforced by ArchUnit and re-proved by arch:verify, a locked OpenAPI contract emitted by a springdoc test slice from the route registry, append-only Flyway migrations with a hash ledger, captured docs examples from MockMvc replays, per-package 1.00 JaCoCo floors on the behavioural core with PIT mutation testing over it, Testcontainers real-engine persistence tests (tool-gated locally, mandatory in CI), the security baseline, and the governance gates (ADR ledger, append-only prompt log, structure snapshot, Node-everywhere gate corpus).

## Outcome

Template skeleton created with foundational ADRs 001-009 (stack, prompt log, test strategy, problem catalogue, architecture profiles, persistence + migrations, dependency budget, contract single source, mandatory gates), domain ADR 010, persistence-adapter ADR 022 and example-slice ADR 030. Self-verifying via the Notes example API slice; the demo ADRs and slice are removed on a real generation run.

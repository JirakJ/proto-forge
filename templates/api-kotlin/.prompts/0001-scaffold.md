---
id: 0001
timestamp: 2026-08-13T00:00:00Z
phase: 1
adr: 001
author: proto-forge
---

## Prompt

Scaffold the fixed proto-forge api-kotlin template: pinned JDK 21 + Kotlin 2.2 + Ktor 3.x stack built by a checksum-pinned Gradle wrapper with locked dependencies, the byte-pinned platform kernel (problems catalogue, redacting SLF4J kernel logger, security-headers plugin, health and the route-not-found fallback), complexity-derived architecture profiles enforced by ArchUnit and re-proved by arch:verify, a locked OpenAPI contract emitted from the route registry and the kotlinx.serialization descriptors with no server running, append-only Flyway migrations with a hash ledger, captured docs examples from Ktor testApplication replays, per-package 1.00 JaCoCo floors on the behavioural core with PIT mutation testing over it, Testcontainers real-engine persistence tests (tool-gated locally, mandatory in CI), the security baseline, and the governance gates (ADR ledger, append-only prompt log, structure snapshot, Node-everywhere gate corpus).

## Outcome

Template skeleton created with foundational ADRs 001-009 (stack, prompt log, test strategy, problem catalogue, architecture profiles, persistence + migrations, dependency budget, contract single source, mandatory gates), domain ADR 010, persistence-adapter ADR 022, example-slice ADR 030 and the delivery ADRs 200-202. Two Kotlin-specific decisions are recorded in ADR 003 rather than configured away: the domain's `KSerializer`s are hand-written so no compiler-generated dead branch sits inside the 1.00 floor, and PIT is told to leave the Kotlin null-check intrinsics alone (measured both ways, 76 % raw / 100 % filtered). Self-verifying via the Notes example API slice; the demo ADRs and slice are removed on a real generation run.

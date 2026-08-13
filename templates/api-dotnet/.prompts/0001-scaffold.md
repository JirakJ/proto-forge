---
id: 0001
timestamp: 2026-08-13T00:00:00Z
phase: 1
adr: 001
author: proto-forge
---

## Prompt

Scaffold the fixed proto-forge api-dotnet template: pinned .NET 10 SDK (global.json) + ASP.NET Core minimal-API stack with committed NuGet lockfiles restored in locked mode, the byte-pinned platform kernel (problems catalogue, redacting kernel logger, security-headers middleware, health), complexity-derived architecture profiles enforced by ArchUnitNET and re-proved by arch:verify, a locked OpenAPI contract emitted from the route registry through the app's own --emit-openapi console mode, append-only EF Core migrations with a hash ledger, captured docs examples replayed against the in-memory test host, 100 % coverlet line/branch/method floors on the behavioural core with Stryker.NET mutation testing over it, real-engine persistence tests against a Postgres container (tool-gated locally, mandatory in CI), the security baseline, and the governance gates (ADR ledger, append-only prompt log, structure snapshot, Node-everywhere gate corpus).

## Outcome

Template skeleton created with foundational ADRs 001-009 (stack, prompt log, test strategy, problem catalogue, architecture profiles, persistence + migrations, dependency budget, contract single source, mandatory gates), domain ADR 010, persistence-adapter ADR 022 and example-slice ADR 030. Self-verifying via the Notes example API slice; the demo ADRs and slice are removed on a real generation run.

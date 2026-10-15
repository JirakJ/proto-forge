---
id: 0001
timestamp: 2026-08-13T00:00:00Z
phase: 1
adr: 001
author: proto-forge
model: claude-fable-5-1
---

## Prompt

Scaffold the fixed proto-forge api-python template: pinned Python 3.12 + FastAPI + Pydantic v2 + SQLAlchemy 2 + Alembic + structlog stack on uv with a committed lock, the byte-pinned platform kernel (problems catalogue, structured redacting logger, security headers, health), complexity-derived architecture profiles enforced by import-linter and re-proved by arch:verify, a locked OpenAPI contract derived natively from app.openapi() over the route registry, append-only alembic migrations with a hash ledger, captured docs examples, 100% coverage on the measured layers with mutmut mutation testing over the behavioural core, the Testcontainers-Postgres real-engine integration tier (CI-mandatory, tool-gated locally — Python has no in-process engine), the security baseline (ruff bandit rules, pip-audit, CycloneDX SBOM), and the governance gates (ADR ledger, append-only prompt log, structure snapshot, Node-everywhere gate corpus).

## Outcome

Template skeleton created with foundational ADRs 001-009 (stack, prompt log, test strategy, problem catalogue, architecture profiles, persistence + migrations, dependency budget, contract single source, mandatory gates), domain ADR 010, persistence-adapter ADR 022 and example-slice ADR 030. Self-verifying via the Notes example API slice; the demo ADRs and slice are removed on a real generation run.

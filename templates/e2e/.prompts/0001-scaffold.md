---
id: 0001
timestamp: 2026-08-13T00:00:00Z
phase: 1
adr: 001
author: proto-forge
model: claude-fable-5-1
---

## Prompt

Scaffold the fixed proto-forge e2e template: the cross-app layer running inside a workspace next to api/ and web/ — a Playwright + TypeScript repo with two generated suites (cross-app flow scenarios derived from flows facets, demonstrated by the Note create-list-delete flow through the real web UI; consumer-driven contract replay per operation against the live api, validating responses with a dependency-free structural JSON-schema-subset validator shared between the suite, the registry gate and the selftest), pure-data case registries with a registry:verify gate (ids, parity, operation existence when the contract is reachable), tool-gated runtime (skip+note locally, hard-fail in CI), and the governance gates (lint strictTypeChecked, typecheck, stub-scan, ADR ledger, append-only prompt log, structure snapshot, byte-pinned gate corpus).

## Outcome

Template skeleton created with foundational ADR 001 (two suites for the cross-app layer). Registries ship the Note demo cases (replaced on a real generation run); the contract is resolved through ../workspace.json contract.source with the E2E_CONTRACT override; `pnpm verify` = config:check, gates:selftest, lint, typecheck, registry:verify, stub:scan, adr:lint, prompt:lint, snapshot:diff — test:e2e is deliberately outside verify, it needs the workspace pair.

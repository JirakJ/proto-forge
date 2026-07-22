# ADR 003: Layered coverage + behavior-first testing

- Status: accepted
- Date: 2026-07-05
- Prompt-log: .prompts/0001-scaffold.md

## Context

A flat coverage threshold forces worthless tests on trivial code and under-protects risky code (BRS §3.1). Tests must assert behavior, not implementation.

## Decision

Coverage thresholds are layered by architectural boundary (proto-ui/domain 100%, infra 100/95, features 85/80, app/config 80/75), enforced per-glob by Vitest V8. Tests query by role/testid (Testing Library); no `vi.mock` of first-party modules. E2E is a separate green/red gate, not folded into the percentage.

## Consequences

Risk-proportionate testing; real behavior is verified. Hard-to-hit branches in shared code still demand 100% (waiver only via ADR).

## Alternatives considered

Flat 90% (mis-allocates effort), mocking first-party modules (tests implementation, not behavior).

# ADR 030: Notes example feature (self-verifying reference slice)

- Status: accepted
- Date: 2026-07-05
- Prompt-log: .prompts/0001-scaffold.md

## Context

The shipped template must prove `pnpm verify` exits 0 on real behavior, and give generated features a reference to mirror — without pre-committing domain content the brief hasn't specified.

## Decision

Ship one complete vertical slice (`src/features/_example/`): Notes built from `@jj/proto-ui`, strings externalized, `data-testid` on every interactive element, zod validation at the boundary, unit + component + E2E tests, and an axe pass. On a real generation run the skill deletes `_example` (and its demo domain/infra) and replaces it with the brief's features under the same per-feature Definition of Done.

## Consequences

The template self-verifies and doubles as the canonical feature example. The demo must be removed on generation to avoid shipping placeholder content.

## Alternatives considered

Empty template (can't prove `verify` on real behavior), keeping the demo in generated output (would ship mock-ish content, BR-12 spirit).

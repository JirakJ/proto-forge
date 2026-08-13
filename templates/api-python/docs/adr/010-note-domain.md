# ADR 010: Note domain model derived from the pydantic model

- Status: accepted
- Date: 2026-08-13
- Prompt-log: .prompts/0001-scaffold.md

## Context

The domain type and its runtime validation must never drift (BRS §12.2). Domain logic must be pure and adapter-agnostic: the same model validates the HTTP boundary and shapes the persisted row.

## Decision

`Note` (pydantic v2) is the single source of the shape — the model IS the type and the schema; there is no separate validator to drift from. A `NoteRepository` Protocol port abstracts storage; the domain depends only on the port, and the fixture factory parses every produced value through the model. This is the demo slice's domain — a generated service replaces it with the brief's entities under the same rules.

## Consequences

Type and validation cannot disagree. The domain is testable in isolation at the 100 % floor, and the persistence adapter proves the same model against real SQL in the CI integration tier.

## Alternatives considered

Dataclass + separate validator (drift risk), TypedDict (no runtime validation at all), an ORM row as the domain type (couples the domain to the adapter it must not see).

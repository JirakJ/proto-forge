# ADR 010: Note domain model derived from zod schema

- Status: accepted
- Date: 2026-08-12
- Prompt-log: .prompts/0001-scaffold.md

## Context

The domain type and its runtime validation must never drift (BRS §12.2). Domain logic must be pure and adapter-agnostic: the same schema validates the HTTP boundary and shapes the persisted row.

## Decision

`NoteSchema` (zod) is the single source of the `Note` shape; the TS type is `z.infer<typeof NoteSchema>`. A `NoteRepository` port abstracts storage; the domain depends only on the port, and the fixture factory parses every produced value through the schema. This is the demo slice's domain — a generated service replaces it with the brief's entities under the same rules.

## Consequences

Type and validation cannot disagree. The domain is testable in isolation at the 100 % floor, and the persistence adapter proves the same schema against real SQL.

## Alternatives considered

Hand-written interface + separate validator (drift risk), class-based entity (unnecessary for a data record).

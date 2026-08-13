# ADR 010: Note domain model derived from zod schema

- Status: accepted
- Date: 2026-07-05
- Prompt-log: .prompts/0001-scaffold.md

## Context

The domain type and its runtime validation must never drift (BRS §12.2 type/schema drift). Domain logic must be pure and infra-agnostic.

## Decision

`NoteSchema` (zod) is the single source of the shape; the TS `Note` type is `z.infer<typeof NoteSchema>`. A `NoteRepository` port abstracts storage; the domain depends only on the port. `draftNote` normalizes and validates input.

## Consequences

Type and validation cannot disagree. The domain is testable in isolation (100% coverage floor).

## Alternatives considered

Hand-written interface + separate validator (drift risk), class-based entity (unnecessary for a data record).

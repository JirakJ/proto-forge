# ADR 010: Note domain model as a validated record

- Status: accepted
- Date: 2026-08-13
- Prompt-log: .prompts/0001-scaffold.md

## Context

The domain type and its runtime validation must never drift (BRS §12.2). Domain logic must be pure and adapter-agnostic: the same constraints validate the create payload and shape the persisted row.

## Decision

`Note` is a `sealed record` — the single source of the shape — and `NoteCreate` carries the `System.ComponentModel.DataAnnotations` constraints that ARE the schema (`[Required(AllowEmptyStrings = false)]`, `[StringLength(2000)]`, with their messages pinned so the `validation-failed` problem detail and the captured docs examples stay byte-stable); DataAnnotations is BCL-only and I/O-free, so the domain stays framework-pure (BR-21). An `INoteRepository` port abstracts storage; the domain depends only on the port, owns no clock and no id generator — both arrive stamped by the caller — and the fixture factory validates every produced value through the same constraints. This is the demo slice's domain — a generated service replaces it with the brief's entities under the same rules.

## Consequences

Type and validation cannot disagree. The domain is testable in isolation at the 100 floor, and the persistence adapter proves the same shape against real SQL in the native tier.

## Alternatives considered

A hand-written class plus a separate validator (drift risk), a mutable property bag as the domain type (aliasing and lifecycle noise for a data record), EF Core mapping attributes on the domain record (couples the model to the persistence framework the profile forbids — the mapping lives on the adapter's entity instead).

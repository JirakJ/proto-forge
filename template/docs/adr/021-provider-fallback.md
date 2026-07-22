# ADR 021: Provider fallback (own | radix)

- Status: accepted
- Date: 2026-07-05
- Prompt-log: .prompts/0001-scaffold.md

## Context

An owned library should not reinvent hard a11y primitives (focus trap, dismissal) from scratch, yet must not hard-depend on a third party (BR-11, NFR-02).

## Decision

A `ProtoUIProvider` selects `own` or `radix`. Primitives whose a11y is non-trivial (Dialog) render either their own accessible implementation or a Radix-backed one. The same component API and the same test suite pass under both.

## Consequences

Teams can drop to Radix for battle-tested behavior or keep the owned impl; both are verified. Dialog carries two implementations to maintain.

## Alternatives considered

Radix-only (weakens the "owned library" claim), own-only (re-implements solved a11y problems).

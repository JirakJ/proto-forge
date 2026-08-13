# ADR 002: Append-only prompt log in Markdown

- Status: accepted
- Date: 2026-07-05
- Prompt-log: .prompts/0001-scaffold.md

## Context

Every prompt that shaped the code must be recorded for provenance (BR-13, NFR-10), and the record must be tamper-evident.

## Decision

Store prompts as one Markdown file per prompt under `.prompts/NNNN-slug.md`. Append-only is enforced twice, not by a database: a local hook blocks edits to existing entries at write time, and a CI step diffs `.prompts/` against the branch base and fails on modified or deleted files (a force-push can evade a history diff — protect the default branch). Each accepted ADR back-references ≥1 entry.

## Consequences

Prompts review in normal PR diffs, version with the code they produced, and add zero runtime dependency (NFR-09). Append-only relies on the CI check + review.

## Alternatives considered

JSONL or SQLite (not diff-reviewable, adds tooling), external service (network dependency, out of footprint budget).

# ADR 022: Real IndexedDB persistence adapter

- Status: accepted
- Date: 2026-07-05
- Prompt-log: .prompts/0001-scaffold.md

## Context

Delivered code must contain no mock data or stubbed dependencies (BR-12); persistence must be real, not faked.

## Decision

`noteRepository` implements the `NoteRepository` port over Dexie/IndexedDB — it genuinely persists, queries, and enforces the schema. Responses are zod-validated at the boundary. A one-time typed seed (`seed.ts`) loads initial rows, exactly like a production DB seed. Unit tests run against `fake-indexeddb` (a real IndexedDB implementation, not a mock).

## Consequences

BR-12 is satisfied without a backend; a remote service later drops in behind the same port. Tests need an IndexedDB polyfill under jsdom.

## Alternatives considered

In-memory object returning literals (a stub, banned by BR-12), `localStorage` (no query/schema, and banned for sensitive data).

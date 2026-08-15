---
area: api-notes
kind: api-area
commit: 0000000000000000000000000000000000000000
capabilities: 2
unknowns: 2
---

# api-notes — the notes resource

The service exposes a notes collection over HTTP. This document states what the
committed code demonstrably does with it, and what it leaves unsettled.

## Capabilities

Every row cites the line that proves it. `observed` means a line in the tree says
so; `inferred` means a competent reviewer would read it that way from the
surrounding code, and an operator must confirm it before relying on it (S6).

| # | Capability | Evidence | Confidence |
| --- | --- | --- | --- |
| C1 | Lists every note, newest first | `src/routes/notes.ts:14` | observed |
| C2 | Rejects a body over 2000 characters | `src/routes/notes.ts:31` | inferred |

## Unknowns

What the sources do not establish. These are observations, not questions — the
question surface is the discovery skill's Q1–Q24 taxonomy, and the `Question`
column names which one each unknown maps to (S5).

| # | Topic | Evidence of absence | Question |
| --- | --- | --- | --- |
| U1 | No error contract — failures leave as the framework's default shape | `src/routes/notes.ts` carries no error handler; no error middleware is registered | Q16 |
| U2 | No pagination on the collection operation | `src/routes/notes.ts:14` returns the full table | Q17 |

## Coverage

This sample area was derived from one route file. `node_modules` and `dist` were
skipped as dependency and build directories (S7) — nothing in this area was read
from either, and no claim above rests on them.

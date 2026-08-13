# The per-unit document skeleton (D5)

Every discovery document is generated from this skeleton verbatim — the headings,
their order and the table columns are exact, and `.discovery/lint.mjs` fails on any
deviation. Prose inside the sections varies between runs; the structure does not.
Documents are **always English**, regardless of the brief's language (an operator
decision, recorded in ADR 008).

## Why DAPA reads Definition / Acceptance criteria / Prerequisites / Assumptions

The classical DAPA discovery framework is a conversation protocol: define the need,
agree on the definition, prove it, get acceptance. A generated document cannot hold a
conversation, so this skill reinterprets the acronym for a document that must earn
sign-off asynchronously: **Definition** (what the unit is, from evidence),
**Acceptance criteria** (how sign-off will be judged), **Prerequisites** (what must
exist first), **Assumptions** (the standing conservative defaults from D4, which hold
until an Answer cell overrides them). Sign-off happens by filling the Answer column —
not in a meeting.

## The skeleton

```markdown
---
id: <unit-id>
kind: screen | feature | api-area
status: open | answered
gapsOpen: <recomputed count of open gap rows>
gapsTotal: <recomputed count of all gap rows>
sources:
  - type: figma
    fileKey: <file key>
    nodeId: "<node id>"
    fileVersion: "<file version at capture time>"
  - type: brief
    path: <path to the verbatim input copy>
    sha256: <64-hex digest of that file>
  - type: confluence
    pageId: <page id>
    version: <page version number>
    url: <absolute page url>
---

# <unit-id>

## Situation

What the pinned sources show, with the evidence named. No claims the sources do not
carry.

## Problem

What is unclear, contradictory or missing — the reason gap rows exist.

## Implication

What each open gap costs if it stays open, tied to gap row numbers ("Gap 2 leaves
the failure path undefined, so ...").

## Need-payoff

What the customer actually gains once the gaps are answered — the value statement,
not a feature list.

## DAPA

### Definition

What this unit is, stated from evidence.

### Acceptance criteria

The observable conditions under which this unit counts as done — including "every
gap row below is answered".

### Prerequisites

What must exist before this unit can be built.

### Assumptions

The standing conservative defaults (D4) for every open gap, restated as the
positions that hold until an answer overrides them.

## Elements

| Element | Testid | Figma node | Image | Notes |
| --- | --- | --- | --- | --- |
| <human name> | <derived data-testid> | <node id or —> | ![<alt>](images/<file>.png) | <one line> |
| <human name> | <derived data-testid> | <node id or —> | — <!-- no-image: <reason, at least 10 characters> --> | <one line> |

## Gap table

| # | Q | Element | Question | Evidence | Proposed default | Answer | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | <Q-id> | <a testid from Elements> | <the specialized question> | <what the sources show, or the evidence of absence> | <the conservative default> | <empty until answered> | open |
```

## The rules the lint enforces over this skeleton

- Frontmatter is complete, and every source carries its type's pin: figma needs
  `fileKey` + `nodeId` + `fileVersion`; brief needs `path` + `sha256`; confluence
  needs `pageId` + `version` + `url` (BR-32).
- The eleven headings above appear exactly once each, in this order.
- The gap table header is byte-exact and every row has eight cells: the Q-id
  resolves in `questions.json`, the Element cell names a testid from the Elements
  table, and Evidence and Proposed default are never empty (BR-30).
- Testids obey `^[a-z0-9]+(-[a-z0-9]+)*$` and are unique across every document of
  the run (BR-31).
- Every referenced image exists and matches its `images.lock` sha256; a `—` Image
  cell carries a `no-image` reason of at least 10 characters (BR-32).
- `gapsOpen` / `gapsTotal` equal the recomputed row counts; `status: answered` holds
  exactly when every Answer cell is non-empty; a row is `answered` exactly when its
  Answer cell is non-empty.
- `discovery.json` agrees with the documents on units, statuses, counts, testids and
  gaps (BR-33).

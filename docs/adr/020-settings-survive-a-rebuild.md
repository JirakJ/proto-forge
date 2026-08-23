# ADR 020: Settings survive a rebuild

- Status: accepted
- Date: 2026-08-22
- Prompt-log: docs/specs/2026-08-22-production-output-bar-design.md (stated by the operator: "if the application has a settings tab it should be persistent between builds, unless an ADR asks for a change")

## Context

A generated web or desktop application persists its entities through the
repository port on a real adapter (Dexie/IndexedDB for the `local` facet, the
typed client for `api`) — with a schema, a versioned store and migrations.
Nothing said the same about *settings*, and settings are exactly where a
generating run reaches for `localStorage.setItem("theme", …)`: one line, no
port, no schema. Ad-hoc web storage has no versioning, so the next build that
renames a key silently resets every user — "my settings reset after the
update" is the defect that makes a user distrust everything else the
application claims to persist.

## Decision

**User state, settings above all, persists through the repository port like any
entity (BR-48).** Its values survive a rebuild and a redeploy because they live
in the versioned store the port already manages. Direct `localStorage` /
`sessionStorage` access in production code is banned outright — `stub:scan`
fails it, in features and in the owned library alike. The settings schema keeps
its identity across releases; **changing or resetting it is an ADR with a
migration**, never a side effect of a new build. The mechanical half (nothing
bypasses the port) is gated; the semantic half (schema identity across
releases, deliberate resets ship as ADR'd migrations) is the Phase-4 DoD, held
in review, with the limit stated in the rule.

## Consequences

The one-line storage shortcut now fails the fast lane on the commit that
introduces it. Settings become an ordinary entity: schema in `src/domain`,
repository port, real adapter, seed defaults in `src/infra/**/seed.ts`, tests
at the same floors. The web-family templates carry no direct storage access
today, so nothing regenerates; the ban simply keeps it that way. A future
legitimate low-level storage need (for example a storage adapter the port
itself is built on) would be the library's concern inside the seed, arriving as
a seed change plus an ADR — not a feature-level bypass.

## Alternatives considered

- **Allow storage behind an allowlisted wrapper module**: the wrapper becomes a
  second persistence system next to the port — two stores, two schemas, one of
  them unversioned. The port is the wrapper.
- **Only warn**: a reset-on-rebuild defect costs user trust invisibly; warnings
  on invisible defects go unread (BR-17's asymmetry argument).
- **Pin storage keys instead of banning storage**: keys are not the problem;
  the missing schema version and migration path are.

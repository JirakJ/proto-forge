# ADR 016: Dead-end interactions are banned in delivered UI

- Status: accepted
- Date: 2026-08-22
- Prompt-log: docs/specs/2026-08-22-production-output-bar-design.md (stated by the operator: "a run implements the screen but wires the New button to 'not available in the prototype' — once an ADR accepting CRUD exists, every screen and action must exist, work, be tested and be documented")

## Context

BR-12 bans `TODO`, `not implemented` and stubbed dependencies in delivered code,
and every gate was green on a run that shipped a button whose handler shows a
toast saying the action "is not available in the prototype". The refusal was a
real i18n key, translated into every locale, rendered by a real component,
covered by a rendering test. Two blind spots made it possible: locale catalogues
(`src/i18n/locales/*.json`) were outside every scan — and that is exactly where
user-facing copy lives — and nothing looked at what a handler *does*, so
`onClick={() => {}}` counted as wired.

## Decision

**A control that renders is a control that works (BR-44).** `stub:scan` in the
web-family templates gains three mechanical checks:

- **Dead-end copy** — a pinned phrase list ("not available/implemented/supported
  in", "coming soon", "in a future version/release", "this prototype/demo/
  preview", "will be available/added") fails in production-code **string
  literals** and in **every locale catalogue value**. Literals only, in code:
  comments legitimately discuss "the demo" the pipeline deletes. Catalogue
  values also reject `TODO`/`FIXME`/lorem, but not `XXX`/`HACK` — those are
  ordinary words in user copy ("life hacks").
- **No-op wiring** — a handler that is a hard-coded empty function (JSX
  attribute or object-property form) and `href="#"` fail. The harness
  (`src/harness/**`) is exempt from this half: its mounts pass no-op callbacks
  by design, being a screenshot catalogue, not a feature.
- The **flow-completeness** half — an accepted CRUD ADR ships create, read,
  update and delete surfaces with tests and docs — cannot be scanned (a scan
  does not know what a flow implies) and lives in the Phase-4 DoD, held in
  review. The limit is stated in the rule, the BR-12 precedent.

If a capability is out of scope, its control does not render, and the scope cut
is a recorded ADR. A run out of budget escalates; it does not ship a refusal
dressed as UI.

## Consequences

The polite refusal now fails the fast lane on the commit that introduces it, in
whichever language it ships (translations mirror the default locale, so the
English list catches the pair). The phrase list is pinned in `stub-scan.mjs`;
widening it is free, narrowing it is a reviewed gate edit. False positives are
possible for legitimate copy that matches a phrase — the remediation is
rephrasing or, where the copy is genuinely right, the gate-failure protocol; no
allowlist ships, because the first allowlist entry becomes the new hiding place.

## Alternatives considered

- **An i18n-verify check instead**: i18n-verify guards translation completeness;
  copy semantics belong with the placeholder scanner, and the api templates'
  stub-scan can inherit the phrase list later without touching i18n machinery.
- **Semantic handler analysis** (does the handler reach a service?): a type-
  level/AST dataflow check with unbounded false negatives — the mechanical
  no-op pattern catches the observed failure at zero analysis cost.
- **Banning `disabled` controls too**: a disabled control with a reason is a
  legitimate UI state (form validation); the ban would outlaw real interfaces.

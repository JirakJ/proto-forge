# ADR 025: The vulnerability-disclosure policy is a probed control in every generated repository

- Status: accepted
- Date: 2026-09-17
- Prompt-log: docs/KNOWN_LIMITATIONS.md as of 0.11.0 ("The vulnerability-reporting policy exists at the root only" — the remaining half of the finding ADR 023 opened)

## Context

Control `SEC-041` — "there is a way to report a vulnerability, and it names a
deadline", SSDF RV.1.3 — was `planned` since the catalogue was written (ADR
013): the plugin had no root policy, and no template's `docs/SECURITY.md` had a
disclosure section. ADR 023 added the root `SECURITY.md`. A generated
repository still inherited no channel of its own, so a finder of a hole in a
generated application had only a public issue tracker.

The catalogue's rule is that an `enforced` control is one a probe re-derives
from repository content — no network, no clock (BR-39) — and that the eight app
templates share the catalogue byte for byte (`security:catalogue`).

## Decision

**`SEC-041` is `enforced`, probed by `disclosurePolicyStated`.** The probe, in
every app template's `sec-conformance.mjs`, holds when `docs/SECURITY.md` has a
`## Reporting a vulnerability` section that names a channel (a URL, an
address, or GitHub's private "Report a vulnerability" form) and a response window (a number of days). Every app template's
`docs/SECURITY.md` gains that section: the repository's GitHub private
vulnerability reporting as the channel, the same acknowledgement, triage, fix
and disclosure deadlines the root policy states, and an explicit instruction to
replace the channel when the repository is hosted elsewhere — the probe fails a
section with neither a channel nor a window, so the replacement cannot be a
deletion. Three selftest cases per app template prove the probe; the
conformance claims are re-derived.

## Consequences

The catalogue reports seven enforced controls. The probe proves shape, not
reachability: a stated channel that nobody reads is a review finding, never a
gate's (NFR-16 keeps probes offline), and the register says so. The `api-*`
seed locks are recut for the changed gate script (BRS §17.2); snapshots are
regenerated. The `e2e` and `workspace` templates are outside the control's
`appliesTo` and carry no section.

## Alternatives considered

- **Leaving the channel as an operator-filled field the stub scan rejects when
  empty:** a generated repository would then fail its own verify until the
  operator wrote a channel, which turns a policy into a scaffold-time chore;
  the GitHub channel is real for the common case and the text says when to
  replace it.
- **Probing for a specific channel (a URL pattern):** the control asks for *a*
  channel and *a* window; pinning GitHub's would make a self-hosted forge
  non-conformant by construction.

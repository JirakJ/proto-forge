# ADR 005: autoPropagate — standing consent for unattended live propagation

- Status: accepted
- Date: 2026-08-12
- Prompt-log: docs/specs/2026-08-12-production-grade-design.md (§9A, extended by the
  operator's instruction of 2026-08-12: work that is implemented propagates to
  Confluence and JIRA immediately **when the setting is on**)

## Context

The integration design is staged-first: no pipeline phase calls out, payloads land in
`.proto-forge/outbox/`, and a live write needs `--commit --approve` typed by an operator
after review. That posture is right as a default — generating a prototype must never
file tickets in a project other people work in as a side effect — but it cannot express
the other legitimate posture: a team that has decided it *wants* every accepted decision
mirrored to JIRA/Confluence the moment it lands, unattended.

A per-run typed flag cannot carry standing consent. An environment variable would be
invisible to review. A default of "on" would be consent nobody gave.

## Decision

A committed `integrations.<name>.autoPropagate: true` in `.proto-forge/config.json` is
standing, reviewed consent for unattended live writes. It stands in for **exactly one
check — the per-run `--approve` — and for nothing else**: the integration must still be
enabled, `dryRun` must still be `false`, the target host must still be on the network
allowlist, and credentials must still come from the environment.

`pnpm sync:auto` is the unattended entry point, run by the pipeline after each
accepted-ADR commit and at release. For each integration it stages payloads always, and
sends only when `enabled && !dryRun && autoPropagate` all hold — otherwise it prints
exactly which door is still closed. The consent lives in the committed config because
that is the one place a reviewer reads: turning it on is a diff, visible in history,
revertable as a decision.

The default ships `false` on both integrations. With every setting at its default, the
"no pipeline phase ever calls out" rule holds verbatim; `autoPropagate` is that rule's
one explicit, auditable exception, recorded in the register as BR-20.

## Consequences

Teams get decision-to-ticket propagation with zero per-run ceremony once they have said
so in a reviewed commit. The semantics are pinned by gate self-tests: autoPropagate
satisfies the approval check, and does **not** bypass dry-run or the network guardrail.
The cost is a second consent form to document and test — accepted, because the
alternative (overloading `--approve` or `dryRun`) would make one flag open two doors.

## Alternatives considered

**Per-run `--approve` only** — cannot be unattended; "run this flag forever" instructions
end up in shell history, not in review. **An environment variable** — invisible to the
reviewer who is supposed to be the consent mechanism. **`autoPropagate` implying
`dryRun: false`** — one flag opening two doors; a reviewer reading "autoPropagate" would
not see the dry-run door swing open. **Sending directly from `sync:jira --commit` when
the flag is on, without a separate `sync:auto`** — conflates the operator's interactive
tool with the pipeline's unattended one; keeping them separate keeps "who initiated
this?" answerable from the command alone.

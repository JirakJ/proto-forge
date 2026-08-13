# ADR 006: Seed re-cut for the v0.5.0 audit remediation

- Status: accepted
- Date: 2026-08-12
- Prompt-log: the v0.4.0 ultracode audit (38 confirmed findings) and the operator's
  production-grade directive of 2026-08-12

## Context

The byte-pinned `@jj/proto-ui` seed (`.proto-forge/seed.lock`, verified by
`snapshot:diff` on every run) changed after v0.4.0, so the pin must be re-cut, and the
rule is that a re-cut is a recorded decision, never a drive-by.

## Decision

Re-cut `seed.lock` over the remediated seed. What changed and why:

- **`packages/proto-ui/package.json` drops the `@radix-ui` dependency entry.** The code
  stopped importing it in v0.4.0 (ADR 003 — owned top-layer implementation), but the
  manifest still declared it, shipping an unused runtime dependency into every
  prototype's install. The lockfile now resolves zero radix packages, and the
  `consistency` gate's new dead-dependency check would fail exactly this. Version
  bumped to 0.4.0.
- **`useDismiss` walk correctness.** One outside gesture dismisses exactly one surface:
  the walk goes newest-first, skips surfaces that do not claim outside pointers (a
  topmost tooltip no longer shields the menu below it), and returns after the first
  dismissal. The pure ordering (`newestFirst`, -1 sorts newest) is exported and
  unit-tested directly.
- **`usePromotion` takes an options object** (`{ ref, open, capabilities, resignal }`)
  — the fourth positional parameter broke the SRP ceiling (`max-params: 3`), and
  `resignal` re-promotes an already-open region when its newest member changes
  (Toast).
- **`Dialog`'s scrim is purely visual, and a modal is not light-dismissed** — on either
  path. v0.4.0 closed on scrim click on the fallback path only (the platform path
  ignored outside clicks), and that asymmetry is where the one-gesture-two-closes
  defect lived. The unification keeps the released platform behaviour: `outsidePointer:
  false`, so the dismiss walk skips the modal and an outside gesture still reaches a
  newer surface above it, while Escape and the caller's controls remain the ways out.
  Dismissal is owned solely by `useDismiss` (one dismiss owner, `layer:scan` rule 5);
  `Menu`, `Toast` and `Tooltip` compose the same hooks under the same contract.

## Consequences

`seed.lock` and `.proto-forge/snapshot.json` are regenerated in the same commit as the
seed edits, so `snapshot:diff` compares against the tree this decision describes.
Screenshots of the affected primitives are re-captured (`docs:shots`) because their
sources changed. Mutation testing re-runs over the changed overlay core.

## Alternatives considered

**Leaving the radix entry in the manifest** — an unused dependency is attack surface
and download weight for no behaviour, and it contradicted ADR 003's ownership claim.
**Pinning the old walk behaviour** — it double-closed stacked surfaces and let a
tooltip swallow gestures; both are defects, not behaviours to preserve.

# ADR 003: Seed v2 — overlays in the top layer, provider switch retired

- Status: accepted
- Date: 2026-08-12
- Prompt-log: docs/specs/2026-08-12-production-grade-design.md

## Context

The vendored `@jj/proto-ui` seed is byte-pinned: `template/.proto-forge/seed.lock` holds
the sha256 of the tree, and the prototype's own `snapshot:diff` re-verifies it on every
run. The pin exists because the seed is the part of a prototype nobody re-reviews — it is
copied in whole and trusted, so it is the cheapest place for an unrecorded change to land.

Re-cutting the pin is therefore a recorded decision, never a step taken to make a red gate
green. This ADR is that record for the first re-cut since the seed was published.

## Decision

The seed is re-cut at `pnpm seed:lock`, and this is what changed.

**Overlays live in the browser's top layer, ordered by when they opened.** The full
reasoning is `template/docs/adr/008`, rewritten in place; the short version is that the
previous design closed the single-overlay failures and left the multi-overlay ones open —
two dialogs had no defined order, a per-kind scale inverted as soon as a stack was two deep,
one Escape closed everything, the modal was not actually inert, and a hostile `z-index`
still won. A new subsystem, `packages/proto-ui/src/overlay/`, holds one module per concern:
the stack, capability detection, the platform adapter, dismissal, scroll lock, inert
background, focus scope and anchoring.

**`showModal()` was tried, implemented and refuted**, which is the finding most worth
carrying forward. It marks the entire document outside the dialog as inert, and promoting a
popover into the top layer does **not** lift that inertness — so a menu or a toast raised
from inside a modal was painted correctly, on top, and completely dead to the pointer. Only
a browser could show this. jsdom has neither inertness nor a top layer, and an assertion on
a `zIndex` value would have called the whole arrangement a pass. Every surface now uses one
mechanism: a manual popover.

**`tokens.layer` loses its per-kind overlay entries.** `modal`, `popover`, `toast` and
`tooltip` are gone, and `layer:scan` fails if any of them returns. They were not unused
leftovers; they were the defect.

**The `own | radix` provider switch is retired** and `@radix-ui/react-dialog` is dropped
(`template/docs/adr/020`, rewritten; `021` deleted). A Radix surface stacks on `z-index`
while an owned one is promoted, so "the same API, the same tests pass under both" was false
exactly where it mattered most. `ProtoUIProvider` survives, re-scoped to owning the overlay
stack and publishing the design tokens as CSS custom properties.

**`Tooltip` is added**, which is also why `tokens.layer.tooltip` had existed with no
consumer.

**`layer:scan` grows rules 4 to 9**, moving the composition from convention to requirement:
a surface must claim a slot; exactly one `document` keydown listener may exist in the
library; exactly one module may read the overlay base; fixed surfaces belong to `overlay/`;
the scale may not grow a per-kind entry; platform calls belong to the adapter.

## Consequences

A prototype generated from this seed gets the layering guarantee by construction, and the
guarantee is verified against a real browser rather than against a style value. The overlay
modules carry 100 % statement, branch, function and line coverage with no exemptions.

It is a **breaking seed change**, taken deliberately at a minor version. `ProtoUIProvider`
lost its `provider` prop, `@radix-ui/react-dialog` is no longer a dependency, and four
`tokens.layer` entries no longer exist. Any prototype already generated from seed v1 that is
upgraded will need those three edits.

Reading `Dialog` now means reading seven small modules rather than one large one. That is
the cost of one responsibility per module, and it is what made the multi-overlay defects
addressable by tests at all.

## Alternatives considered

**Leave the seed at v1 and ship the overlay subsystem unused.** The modules would be dead
code in every generated prototype — the template's own rules reject exactly that, and the
defects would remain in the shipped components.

**Re-cut the pin without an ADR.** What the pin exists to prevent. A seed change with no
record is indistinguishable from tampering, and `snapshot:diff` deliberately cannot tell
the difference.

**Ship the overlay subsystem as an opt-in alongside the old components.** Two
implementations of the same guarantee, which is the shape ADR 020 (prototype namespace) removes for
the Radix branch. It would have doubled the surface to test and left a prototype's layering depending
on which import it happened to use.

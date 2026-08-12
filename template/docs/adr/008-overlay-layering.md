# ADR 008: Overlays live in the browser's top layer, ordered by when they opened

- Status: accepted
- Date: 2026-08-12
- Prompt-log: .prompts/0001-scaffold.md

## Context

Every overlay declared its stacking value from a single scale in `tokens.layer` and
rendered through a body-level portal. That closed the classic single-overlay failures: an
ancestor `transform`, `filter` or `overflow: hidden` could no longer trap or clip a popup,
and a sticky header could not paint over a modal.

It did not close the ones that appear the moment a second surface exists.

- **Two surfaces of the same kind had no defined order.** Two open dialogs both carried
  `tokens.layer.modal`, so which one painted on top was decided by mount order inside the
  portal host — not by which the user opened last.
- **A per-kind scale inverts as soon as a stack is two deep.** `popover` deliberately
  outranked `modal` so a menu inside a dialog stayed usable. With dialog B opened on top
  of dialog A, the menu belonging to A still painted above B. No choice of offsets repairs
  this: the kind term dominates the ordinal term by construction.
- **Escape closed everything at once.** Each surface installed its own `document` keydown
  listener, so one keystroke inside a menu within a dialog dismissed both.
- **The modal was not modal.** `aria-modal="true"` is a promise, not a mechanism. Without
  `inert` the page behind the dialog stayed focusable and reachable by a screen reader,
  and nothing locked the scroll.
- **A hostile `z-index` still won.** Any scale, however well ordered, loses to
  `z-index: 2147483647` in application code.
- **jsdom cannot see paint.** A unit test could assert the `zIndex` value it had just set,
  which is a tautology, and the layering guarantee had exactly one browser test.

The two `Dialog` implementations behind the `own | radix` provider switch also disagreed
on the property that matters most for an overlay: one was portalled and promoted, the
other stacked on `z-index`.

## Decision

**The platform decides who is on top.** A modal is a real `<dialog>` opened with
`showModal()`; menus, toasts and tooltips use the Popover API. An element in the top layer
is not part of the document's stacking contexts at all, so no ancestor and no `z-index` —
however large — competes with it. Order *within* the top layer is promotion order, which
is precisely the semantics required: a dialog opened later is above, a popover raised from
it is above that, and closing one returns the previous surface to the top.

**Stacking is ordered by when a surface opened, never by what kind it is.** `kind` selects
the platform API and whether the surface blocks the page; it plays no part in layering. The
fallback z-index is therefore `tokens.layer.overlay + ordinal * STEP`, and
`tokens.layer` keeps only `base`, `raised`, `sticky` and `overlay` — the per-kind overlay
entries were not merely unused, they were the defect.

**One responsibility per module** (NFR-20). `packages/proto-ui/src/overlay/` holds
`OverlayStack` (order, `isTopmost`, the fallback value — and the only reader of the scale),
`capabilities` (the only feature detection), `topLayer` (the only caller of `showModal`,
`showPopover`, `hidePopover`), `useDismiss` (**the** keydown owner, dispatching to the
topmost surface alone), `useScrollLock` and `useInertBackground` (refcounted, restoring what
they found), `useFocusScope` (entry, containment, return through a stack) and `useAnchor`
(CSS anchor positioning where available, rect arithmetic otherwise). A primitive composes
these and implements none of them.

**The fallback path is real code, not a comment.** A browser without `showModal` renders the
same `<dialog>` element with its `open` attribute set, plus its own scrim, and takes over
focus trapping, inerting and Escape. Same markup, same testids, one test contract (NFR-24).

**`<Portal>` stays.** Top layer *and* a body-level host is deliberate redundancy: the
fallback needs the host, and it keeps the "no fixed surface outside the portal" rule
meaningful.

`scripts/layer-scan.mjs` enforces the mechanical half: no numeric `zIndex`; out-of-flow
positioning declares its layer; a fixed surface goes through the portal; one dismiss owner;
one reader of the fallback scale; one adapter for platform calls. `e2e/overlay-layering.e2e.ts`
asserts the result against Chromium's real paint order via `elementFromPoint`, including a
hostile `z-index`, dialog-over-dialog, a menu under a later dialog, `contain: paint`
ancestors, scroll-lock refcounting, focus return through a stack, and forced-colors mode.

## Consequences

Popups are on top because the browser put them there, and the guarantee no longer depends
on arithmetic anyone can out-bid. Two dialogs, a menu inside a dialog, and a toast raised
from a modal all order correctly with no per-kind reasoning. Escape closes one thing.

The library gains its first stylesheet: `::backdrop` and `@supports` cannot be inline
styles. Its values are CSS custom properties derived from `tokens` and published on the
document element — a wrapper element would not reach the top layer, where a surface is a
descendant of nothing the provider renders. `consistency` re-derives the set, so the two
languages stay one source.

jsdom implements none of `showModal`, `showPopover` or `CSS.supports`, so capabilities are
**injected** and every platform call is guarded on the element. Both paths are therefore
reachable from unit tests, and the overlay modules reach 100 % coverage with no exemptions,
while Chromium proves the paint order the unit tests cannot see.

`Dialog` no longer owns focus, dismissal or scroll behaviour, so a change to any of those is
one file and one test file. The cost is indirection: reading `Dialog` now means reading
seven small modules instead of one large one.

## Alternatives considered

**A dynamic z-index stack, without the top layer.** Fixes ordering and dismissal, and was
the plan of record until the arithmetic was written out. It still loses to a hostile
`z-index` in application code, and it leaves the guarantee resting on numbers rather than on
the platform.

**Keeping the per-kind scale and adding an owner offset.** Written out and rejected: with
`popover` based above `modal`, the kind term dominates, so a menu belonging to dialog A
still outranks a later dialog B for every choice of offset.

**Keeping the Radix branch alongside the top layer.** Two mechanisms for one component
means two guarantees, and the layering tests would have to be provider-aware — which is
the gap this ADR closes.

**Pixel-diffing screenshots to catch layering regressions.** Fails on font hinting across
machines far more often than on real bugs. Geometry and hit-testing answer the question
that matters — "what would a click here actually hit?" — deterministically.

**`inert` on `<body>` instead of the app root.** Simpler, and wrong: the overlay host is a
body-level sibling, so it would make the surface itself unreachable.

# ADR 008: One stacking scale, and every overlay through a portal

- Status: accepted
- Date: 2026-08-11
- Prompt-log: .prompts/0001-scaffold.md

## Context

The seeded overlays declared no `z-index` at all. `Dialog` (own provider) rendered its scrim in place, `Menu` used `position: absolute` inside a relatively-positioned wrapper, and the toast region relied on being late in the DOM. All three worked in isolation and all three break the moment the app grows a normal layout:

- an ancestor with `transform`, `filter`, `will-change` or `opacity < 1` creates a stacking context that no descendant `z-index` can escape — a modal rendered inside one is painted under its own page
- an ancestor with `overflow: hidden` crops the popup to the box it was declared in
- a later sibling with any `z-index` wins on source order

The two `Dialog` implementations also diverged: the Radix one portalled, the owned one did not — so "same API, same tests pass under both" was not true of the property that matters most for an overlay.

## Decision

Two rules, both mechanically enforced.

1. **One scale.** `tokens.layer` is the only source of stacking values: `base` → `raised` → `sticky` → `overlay` → `modal` → `popover` → `toast` → `tooltip`. `popover` deliberately outranks `modal`, so a menu opened inside a dialog is usable; `toast` outranks both, because a notification may be the reason the blocking surface should close.
2. **One host.** Every popup surface renders through `<Portal>` into a single unstyled `<div id="proto-ui-overlay-root">` appended last to `<body>`. Unstyled matters: it creates no stacking context, so layer values compete at the root level instead of inside a local one.

`scripts/layer-scan.mjs` fails the build on a numeric `zIndex` anywhere outside `tokens.ts`, on out-of-flow positioning without a declared layer, on a `position: fixed` surface that skips the portal, and on a reordering of the scale itself. `e2e/overlay.e2e.ts` asserts the result against Chromium's real paint order — via `elementFromPoint`, not by reading back a style value — including a fixture whose ancestor combines `transform`, `filter` and `overflow: hidden`.

## Consequences

Popups are on top by construction rather than by luck, and the guarantee survives refactors: adding `transform` to a parent, or a sticky header, can no longer bury a modal. `Menu` grew real anchoring work — viewport coordinates recomputed on resize and captured scroll — plus focus entry and outside-click dismissal, because a portalled surface is no longer adjacent to its trigger in the DOM. The owned and Radix dialogs now behave identically. Overlays are no longer nested inside their logical parent in the DOM, so anything reading the tree (a CSS descendant selector, a naive `container.querySelector`) must query the document instead; the shipped tests do.

## Alternatives considered

**A `z-index` convention in a comment** — what existed in spirit, and exactly what drifts; nothing failed when it was ignored. **`position: fixed` without portalling** — does nothing about ancestor stacking contexts, which is the actual failure mode. **The Popover API / `<dialog>` with `showModal()`** — the top layer solves this natively and is the right answer for a product; rejected here because it does not compose with the `own | radix` provider switch, and `::backdrop` styling plus focus behaviour would differ between the two implementations, breaking the shared-test contract. Worth revisiting when the provider switch is dropped. **Pixel-diffing screenshots to catch layering regressions** — fails on font hinting across machines far more often than on real bugs.

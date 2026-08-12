# Dialog

A modal that is on top because the browser put it there. The surface is promoted into the
**top layer** as a manual popover — not part of the document's stacking contexts at all. So no ancestor `transform`, `filter` or `overflow: hidden` can trap
or clip it, and a `z-index: 2147483647` somewhere in application code cannot compete with it.

![Dialog over its backdrop](open.png)

A menu opened *inside* the dialog draws above it — and a dialog opened *after* the menu draws
above the menu. Order in the top layer is the order things opened, so a stack behaves the way
a user expects without any per-kind reasoning:

![A menu drawn over the modal it was opened from](menu-over-modal.png)

Rendered from inside an ancestor with `transform` and `overflow: hidden` — the combination that
traps and crops an in-place modal — it stays whole and on top:

![The modal escaping a stacking trap and a sticky header](escapes-stacking-trap.png)

`e2e/overlay-layering.e2e.ts` asserts this against real paint order in Chromium via
`elementFromPoint`, never by reading back a style value.

## API

| Prop | Type | Notes |
| --- | --- | --- |
| `open` | `boolean` | Fully controlled. Closed renders `null`, not a hidden node. |
| `onClose` | `() => void` | Called by Escape when this is the topmost surface, and by a scrim click on the fallback path. |
| `title` | `string` | **Required**, already translated. Becomes the accessible name and the visible `<h2>`. |
| `data-testid` | `string` | **Required.** Heading is `<testid>-title`; the fallback scrim is `<testid>-scrim`. |

## What it composes

Dialog implements none of this itself (NFR-20) — it wires together the `overlay/` modules:

| Concern | Module |
| --- | --- |
| place in the stack, fallback z-index | `useOverlaySlot` |
| the only platform calls | `promote` / `demote` |
| focus entry and return | `useFocusScope` |
| refcounted scroll lock | `useScrollLock` |
| refcounted `inert`, on the app root only | `useInertBackground` |
| Escape, topmost only | `useDismiss` |

## Two paths, one contract

| | Top layer | Fallback |
| --- | --- | --- |
| Placement | `showPopover()` on a manual popover | `position: fixed` at `slot.fallbackZIndex` |
| Scrim | `[popover]::backdrop` | a `position: fixed` element under the surface |
| Focus containment | `useFocusScope({ trap: true })` | same |
| Background inert | `useInertBackground` on the app root | same |
| Escape | `useDismiss`, topmost only | same |

Only the placement and the scrim differ. `showModal()` would have supplied containment and
inertness natively, and was rejected for it: its inertness also killed every surface
promoted above the modal (ADR 008).

Markup and testids are identical either way, so one test file covers both (NFR-24).
`Dialog.test.tsx` pins the capabilities per case rather than accepting whatever the
environment implements — jsdom implements none of the top-layer APIs, so without pinning the
primary path would never be exercised.

## Layering

Nothing here reads `tokens.layer`. The stack hands the surface a `slot.fallbackZIndex`, and the
scrim sits at that value with the surface one step above it. `layer:scan` fails the build on a
numeric `zIndex`, on a `position: fixed` surface that skips the portal, and on any module other
than `OverlayStack` reading the overlay scale.

## Accessibility

- `role="dialog"`, `aria-modal="true"`, accessible name from `title`.
- Focus moves to the dialog on open and returns to the opener on close — through a stack, so
  closing a dialog opened from another dialog returns focus into the first one.
- Tab is contained by `useFocusScope` on both paths.
- Escape closes **only the topmost** surface. A menu open inside the dialog takes the first
  Escape; the dialog takes the next.
- The page cannot scroll behind it, and the lock survives a second dialog closing.
- VoiceOver smoke: opening announces the title, and swiping does not reach page content behind
  the dialog.

## i18n

`title` and everything in `children` are caller-supplied `t()` values. The library owns no copy.

```tsx
<Dialog open={open} onClose={close} data-testid="notes-delete" title={t("notes.delete.title")}>
  <p>{t("notes.delete.body")}</p>
</Dialog>
```

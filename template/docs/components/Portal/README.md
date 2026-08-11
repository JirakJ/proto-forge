# Portal

<!-- no-screenshot: Portal renders nothing of its own — it relocates its children, so a picture of it would be a picture of whatever was passed in. Its behaviour is documented by the Dialog and Menu screenshots. -->

The mechanism behind "popups are always on top". Every overlay surface in the library renders through it.

## API

```tsx
<Portal>{children}</Portal>
export const OVERLAY_ROOT_ID = "proto-ui-overlay-root";
```

## What it does, and why that specific way

Children are relocated into a single `<div id="proto-ui-overlay-root">` appended last to `<body>`. Three properties of that host are load-bearing:

1. **It is unstyled.** No `position`, `transform`, `opacity` or `filter`, so it creates **no stacking context**. Values from `tokens.layer.*` therefore compete at the root level instead of being trapped inside a local context — the trap that makes `z-index: 9999` fail to do anything.
2. **It is the last child of `<body>`.** Where two elements tie on z-index, document order decides, and the overlay root wins.
3. **It is shared and idempotent.** Concurrent overlays reuse one host rather than stacking hosts, so a dialog with a menu inside it produces one root, not two.

Rendering an overlay *in place* gives none of these. An ancestor with `transform: translateZ(0)` (a very common performance hint) creates a stacking context that no descendant z-index can escape, and an ancestor with `overflow: hidden` clips it.

## Enforcement

`layer:scan` fails any file that renders a `position: fixed` surface without going through `Portal`, `RadixDialog.Portal` or `createPortal`.

## Server rendering

The host is resolved in a `useState` lazy initializer, so it is created once per overlay instance and StrictMode's double invocation reuses it. This is a client-only prototype stack; an SSR target would need the host created in an effect instead.

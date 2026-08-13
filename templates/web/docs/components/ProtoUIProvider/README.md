# ProtoUIProvider

<!-- no-screenshot: the library root renders no markup of its own — it mounts the overlay stack and publishes the design tokens, and a picture of it would be a picture of its child. -->

The library's root. Wrap the application once, in `App.tsx`. Two jobs, and nothing else can do
either of them.

## 1. It owns the overlay stack

Surfaces order themselves by when they opened, and dismissal, the scroll lock and the `inert`
bookkeeping all need a single owner. That owner is a **React context**, not a module singleton
(NFR-22): a singleton is a global with a nicer name, two trees in one document would fight over
it, and no test could isolate either.

A `Dialog`, `Menu`, `ToastProvider` or `Tooltip` rendered outside this provider throws, naming
the provider it needs. That is deliberate — the alternative is a surface that silently believes
it is the only one on the page.

## 2. It publishes the design tokens as CSS custom properties

`tokens.ts` is the single source, and the custom properties are **derived** from it rather than
written out again. They are set on the **document element**, and that is load-bearing rather
than tidy: custom properties inherit down the DOM, and a surface in the browser's top layer — or
portalled to the body-level host — is a descendant of nothing this provider renders. Set on a
wrapper, `var(--pf-color-scrim)` inside `dialog::backdrop` would resolve to nothing and the
scrim would quietly disappear.

`consistency` re-derives the set and fails if the overlay stylesheet uses a property the tokens
do not produce, or smuggles in a literal colour.

## API

| Prop | Type | Default | Notes |
| --- | --- | --- | --- |
| `children` | `ReactNode` | — | Rendered without a wrapper element, so app landmarks are untouched. |
| `capabilities` | `Capabilities` | detected | Pins the platform capabilities instead of detecting them. |

```tsx
<ProtoUIProvider>
  <App />
</ProtoUIProvider>
```

### Why `capabilities` exists

jsdom implements none of `showModal`, `showPopover` or `CSS.supports`, so a unit test that
detected capabilities would only ever exercise the fallback path — and the top-layer path is the
primary one. Pinning them makes both deliberate:

```tsx
render(
  <ProtoUIProvider capabilities={{ topLayerDialog: true, popover: true, cssAnchor: false }}>
    <Dialog open title={t("x")} data-testid="dlg" onClose={close}>…</Dialog>
  </ProtoUIProvider>,
);
```

It is a test seam, not a feature switch. Production code never passes it, and the real behaviour
behind each capability is proven in Chromium by `e2e/overlay-layering.e2e.ts`.

## What it no longer does

It used to select between the owned implementation and a Radix-backed one. That switch is retired
(ADR 020): a Radix surface stacks on `z-index` while an owned one is promoted into the top layer,
so "the same tests pass under both" was false exactly where it mattered most. There is one
implementation, and `@radix-ui/react-dialog` is no longer a dependency.

## Placement

Once, at the root, outside the router. Nesting is legal — the inner provider wins for its subtree
and gets its own stack — which is what makes two independent stacks testable in one document.

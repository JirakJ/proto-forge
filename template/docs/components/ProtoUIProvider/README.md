# ProtoUIProvider

<!-- no-screenshot: a context provider renders no markup of its own; what it changes is which implementation the primitives use, and both look identical by design. -->

Selects the implementation backing the primitives that have two.

## API

| Prop | Type | Default | Notes |
| --- | --- | --- | --- |
| `provider` | `"own" \| "radix"` | `"own"` | Which implementation the primitives resolve to. |
| `children` | `ReactNode` | — | — |

```tsx
const kind = useProviderKind(); // "own" | "radix"
```

## Why two implementations

`own` is the default: the library owns its accessible modal, which keeps the prototype free of a headless-UI dependency for the one primitive most likely to need custom behaviour. `radix` exists as an escape hatch for a project that has standardised on Radix, or that hits an edge case the owned implementation does not cover.

The contract is that **swapping the provider changes nothing observable**: same props, same accessible names and roles, same layer values, same testids. `Dialog.test.tsx` runs the same assertions against both, including the layering contract, so a divergence fails the build rather than surfacing as a visual bug later.

Currently only `Dialog` branches on the provider. Others resolve identically under both.

## Placement

Wrap the application once, in `App.tsx`. Nesting providers is legal but has no use case yet — the inner one simply wins for its subtree.

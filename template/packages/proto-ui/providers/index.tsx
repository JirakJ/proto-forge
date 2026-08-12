import { useEffect, type ReactNode } from "react";
import { OverlayStackProvider, type Capabilities } from "../src/overlay/index";
import { tokensCssEntries } from "../tokens";

// @adr 020 - the library's root provider
//
// One wrapper a prototype mounts once, and it does two things nothing else can:
//
//   1. owns the overlay stack, so surfaces order themselves by when they opened and
//      dismissal, scroll lock and inert have a single owner (NFR-22 — a module
//      singleton would be a global with a nicer name, and two trees in one document
//      would fight over it)
//   2. publishes the design tokens as CSS custom properties
//
// (2) goes on the DOCUMENT ELEMENT, not on a wrapper element, and that is load-bearing
// rather than tidy: custom properties inherit down the DOM, and an overlay surface in
// the browser's top layer — or portalled to the body-level host — is not a descendant of
// anything this provider renders. Set on a wrapper, `var(--pf-color-scrim)` inside
// `dialog::backdrop` would resolve to nothing and the scrim would silently disappear.
//
// This provider no longer selects an implementation. The `own | radix` switch is gone
// (see ADR 020): it cost the layering guarantee, because a Radix surface stacks on
// z-index while an owned one is promoted into the top layer, so "the same tests pass
// under both" was false exactly where it mattered most.

export type ProtoUIProviderProps = {
  children: ReactNode;
  /**
   * Pin the platform capabilities instead of detecting them. For tests, which need to
   * exercise both the top-layer path and the fallback deliberately rather than by
   * whatever the test environment happens to implement.
   */
  capabilities?: Capabilities;
};

export function ProtoUIProvider({ children, capabilities }: ProtoUIProviderProps) {
  useEffect(() => {
    const root = document.documentElement;
    for (const [name, value] of tokensCssEntries) root.style.setProperty(name, value);
    return () => {
      for (const [name] of tokensCssEntries) root.style.removeProperty(name);
    };
  }, []);

  // Spread rather than pass-through: tsconfig sets exactOptionalPropertyTypes, so an
  // explicit `undefined` is not the same as an absent property.
  const stackProps = capabilities === undefined ? {} : { capabilities };
  return <OverlayStackProvider {...stackProps}>{children}</OverlayStackProvider>;
}

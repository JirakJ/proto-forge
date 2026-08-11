// The single source of design tokens (BRS §12.3). Every colour is pre-validated
// for WCAG 2.2 AA contrast on the default light background; `axe` re-checks the
// rendered output. Nothing else in the tree may define a colour/space/radius/layer.

export const tokens = {
  color: {
    bg: "#ffffff",
    fg: "#1a1a1a", // ~16:1 on bg
    primary: "#1d4ed8", // ~5.6:1 on bg (AA text)
    primaryFg: "#ffffff", // ~5.6:1 on primary
    danger: "#b91c1c", // ~5.9:1 on bg
    border: "#767676", // 4.5:1 on bg (>=3:1 non-text)
    muted: "#595959", // ~7:1 on bg
    focus: "#1d4ed8",
    scrim: "rgba(0, 0, 0, 0.5)",
  },
  space: { xs: "4px", sm: "8px", md: "16px", lg: "24px" },
  radius: { sm: "4px", md: "8px" },
  font: {
    family: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
    sizeSm: "14px",
    sizeMd: "16px",
    sizeLg: "20px",
  },
  focusRing: "0 0 0 3px rgba(29, 78, 216, 0.5)",

  // The single stacking scale (BR-16). Every positioned element draws its zIndex
  // from here — `layer:scan` fails the build on a numeric literal anywhere else.
  // Ordering is load-bearing and reads bottom-up:
  //   sticky   app chrome (headers, toolbars) — below every popup
  //   overlay  the modal scrim
  //   modal    the dialog surface, above its own scrim
  //   popover  menus/listboxes — ABOVE modal, so a menu opened inside a dialog wins
  //   toast    transient notifications — above every blocking surface
  //   tooltip  the last word; never blocks input
  // Overlays additionally render through <Portal> into a body-level root, so no
  // ancestor transform/filter/overflow can trap or clip them.
  layer: {
    base: 0,
    raised: 10,
    sticky: 100,
    overlay: 1000,
    modal: 1010,
    popover: 1100,
    toast: 1200,
    tooltip: 1300,
  },
} as const;

export type Tokens = typeof tokens;
export type Layer = keyof Tokens["layer"];

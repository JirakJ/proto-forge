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

// --- the same tokens, as CSS custom properties --------------------------------
// `::backdrop` and `@supports` cannot be written as inline styles, so the overlay
// stylesheet needs the design values in CSS. They are DERIVED here rather than typed
// out again: a second hand-written copy is the single-source violation BR-15 exists to
// prevent, and it would be one nobody notices until a colour changes in one place only.
//
// `consistency` re-derives this set and fails when the stylesheet uses a var this
// generator does not produce, or when a name it produces is not backed by a token.

const NAME_PREFIX = "--pf";

/** `color.primaryFg` becomes `--pf-color-primary-fg`: one predictable name per token. */
const kebab = (value: string) => value.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

function properties(): string[] {
  const out: string[] = [];
  for (const [group, value] of Object.entries(tokens)) {
    if (typeof value === "object") {
      for (const [key, leaf] of Object.entries(value)) {
        out.push(`${NAME_PREFIX}-${kebab(group)}-${kebab(key)}: ${String(leaf)};`);
      }
    } else {
      out.push(`${NAME_PREFIX}-${kebab(group)}: ${String(value)};`);
    }
  }
  return out;
}

/** The `:root` block the library injects once, via ProtoUIProvider. */
export const tokensCssProperties: string = properties().join("\n  ");

/** Every custom-property name the tokens produce, for the consistency gate and for tests. */
export const tokensCssNames: readonly string[] = properties().map((line) => line.split(":")[0]!.trim());

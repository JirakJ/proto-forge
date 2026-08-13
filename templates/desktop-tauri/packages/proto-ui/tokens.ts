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

  // The stacking scale for IN-FLOW chrome, plus one base for the overlay fallback.
  //
  // There is deliberately no per-kind overlay entry any more (BR-16, ADR 008). A scale
  // with `popover` ranked above `modal` is correct for one modal and inverted for two:
  // a menu belonging to dialog A would paint above a dialog B opened later, and no
  // choice of offsets repairs it because the kind term dominates. Surfaces are ordered
  // by WHEN THEY OPENED instead, which is what the browser's top layer does, so the
  // fallback and the platform cannot disagree about who is on top.
  //
  //   base     ordinary content
  //   raised   a card or a hovered row lifting off the page
  //   sticky   app chrome — headers, toolbars, the skip link. Below every surface.
  //   overlay  the base every surface is stacked from, ordinal * STEP above it.
  //            Read by overlay/OverlayStack.tsx and by nothing else (layer:scan rule 6).
  layer: {
    base: 0,
    raised: 10,
    sticky: 100,
    overlay: 1000,
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

function entries(): [string, string][] {
  const out: [string, string][] = [];
  for (const [group, value] of Object.entries(tokens)) {
    if (typeof value === "object") {
      for (const [key, leaf] of Object.entries(value)) {
        out.push([`${NAME_PREFIX}-${kebab(group)}-${kebab(key)}`, String(leaf)]);
      }
    } else {
      out.push([`${NAME_PREFIX}-${kebab(group)}`, String(value)]);
    }
  }
  return out;
}

/**
 * name/value pairs, which is the shape the provider actually applies. The string and
 * name-only forms below are derived from this one so there is a single traversal of
 * `tokens` to get wrong.
 */
export const tokensCssEntries: readonly (readonly [string, string])[] = entries();

/** The same declarations as CSS text, for documentation and for tests to assert against. */
export const tokensCssProperties: string = tokensCssEntries.map(([n, v]) => `${n}: ${v};`).join("\n  ");

/** Every custom-property name the tokens produce, for the consistency gate and for tests. */
export const tokensCssNames: readonly string[] = tokensCssEntries.map(([n]) => n);

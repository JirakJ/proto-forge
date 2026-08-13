// @adr 008 - one contract every overlay surface satisfies
// The generated component-library suite drives Dialog, Menu, ToastProvider and
// Tooltip through the same four properties, which is only possible because they all
// answer to this shape. Adding a fifth kind of surface means satisfying this, not
// editing the four that exist.

/**
 * Every kind of surface the library has. Exported as a value, not only a type, so the
 * overlay:matrix gate and the harness can enumerate them: a kind that exists in the
 * type but in nobody's test is the gap that gate is looking for.
 */
export const OVERLAY_KINDS = ["modal", "popover", "toast", "tooltip"] as const;

/**
 * What a surface is, for stacking purposes. The kind decides which platform API
 * promotes it and whether it blocks the page — NOT where it paints. Paint order is
 * promotion order (see OverlayStack), which is the one thing a fixed per-kind scale
 * got wrong.
 */
export type OverlayKind = (typeof OVERLAY_KINDS)[number];

export type OverlaySurface = {
  kind: OverlayKind;
  open: boolean;
  onDismiss: () => void;
  /** Required (BR-02): every surface is addressable, and its parts derive from this. */
  "data-testid": string;
};

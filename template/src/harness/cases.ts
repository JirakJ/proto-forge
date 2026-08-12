// @adr 009 - one registry, two consumers, and no React in the metadata
//
// This file is PURE DATA. It imports nothing, and in particular no component, because
// two very different things read it:
//
//   pnpm docs:shots            photographs one case per URL fragment
//   e2e/component-library      generates one test per case, at collection time
//
// The second is why the split exists. A Playwright spec runs in Node and needs the case
// list before any browser starts; importing a module that pulls in React, the whole
// component library and a stylesheet to read fifteen strings would be slow and would
// couple the test runner to the bundler. `mounts.tsx` holds the JSX, keyed by the same
// ids, and overlay:matrix fails if the two disagree.

/**
 * What a component IS, which decides what the matrix gate requires of it.
 *
 *   surface     a popup: a modal, menu, toast or tooltip. Needs the full set, plus a
 *               case asserting it wins a hit test, plus one asserting focus comes back.
 *   visual      renders markup worth photographing. Needs the full set.
 *   structural  renders no markup of its own — a portal, a provider. Needs a unit test
 *               and a page that states why there is no screenshot. Demanding a picture
 *               would only produce a picture of its child.
 */
export type CaseKind = "surface" | "visual" | "structural";

export type Case = {
  /** Stable URL fragment, kebab-case, unique. Also the generated test's name. */
  id: string;
  /** The exported component this documents — decides the docs/ folder. */
  component: string;
  kind: CaseKind;
  /** Screenshot file name and caption. `none` for a structural component. */
  state: string;
  /** What a reader should take away from this image. */
  note: string;
  /** Applied in order before anything is asserted or photographed. */
  interactions?: { click?: readonly string[]; press?: readonly string[] };
  assert?: {
    /** This testid must win `elementFromPoint` at its centre AND its inset corners. */
    topmost?: string;
    /** This testid's box must escape its nearest clipping ancestor. */
    notClipped?: string;
    /** Tab must visit these testids in this order. */
    focusOrder?: readonly string[];
    /** After dismissal, focus must land on this testid. */
    focusReturnsTo?: string;
  };
  /** A reason, never a bare boolean: an accessibility check is skipped on the record. */
  axe?: { skip: string };
};

export const cases: readonly Case[] = [
  {
    id: "button-variants",
    component: "Button",
    kind: "visual",
    state: "variants",
    note: "The three variants side by side, plus the disabled state.",
  },
  {
    id: "field-default",
    component: "Field",
    kind: "visual",
    state: "default",
    note: "Label, input and placeholder in the resting state.",
  },
  {
    id: "field-error",
    component: "Field",
    kind: "visual",
    state: "error",
    note: "Invalid state: red border, aria-invalid, and the message announced via role=alert.",
  },
  {
    id: "select-default",
    component: "Select",
    kind: "visual",
    state: "default",
    note: "Native select on the same label/error wiring as Field.",
  },
  {
    id: "checkbox-default",
    component: "Checkbox",
    kind: "visual",
    state: "default",
    note: "Checkbox with the label beside it, sharing Field's a11y contract.",
  },
  {
    id: "table-populated",
    component: "Table",
    kind: "visual",
    state: "populated",
    note: "Caption, scoped column headers, and one testid per row and cell.",
  },
  {
    id: "table-empty",
    component: "Table",
    kind: "visual",
    state: "empty",
    note: "The empty state, whose label is translated like any other string.",
  },
  {
    id: "tabs-default",
    component: "Tabs",
    kind: "visual",
    state: "default",
    note: "Roving tabindex across the tablist; only the selected panel is visible.",
  },
  {
    id: "menu-open",
    component: "Menu",
    kind: "surface",
    state: "open",
    note: "The surface is promoted into the top layer and anchored to the trigger in viewport coordinates.",
    interactions: { click: ["harness-menu-trigger"] },
    assert: { topmost: "harness-menu-surface" },
  },
  {
    id: "dialog-open",
    component: "Dialog",
    kind: "surface",
    state: "open",
    note: "A modal in the top layer, with the browser painting its backdrop.",
    assert: { topmost: "harness-dialog" },
  },
  {
    id: "dialog-with-menu",
    component: "Dialog",
    kind: "surface",
    state: "menu-over-modal",
    note: "The layering guarantee, visible: a menu opened inside a modal draws above it.",
    interactions: { click: ["harness-dialog-menu-trigger"] },
    assert: { topmost: "harness-dialog-menu-surface" },
  },
  {
    id: "dialog-stacking-trap",
    component: "Dialog",
    kind: "surface",
    state: "escapes-stacking-trap",
    note: "The top layer proven: the modal escapes an ancestor with transform + overflow:hidden, and draws over a sticky header.",
    assert: { topmost: "harness-trapped-dialog", notClipped: "harness-trapped-dialog" },
  },
  {
    id: "tooltip-open",
    component: "Tooltip",
    kind: "surface",
    state: "open",
    note: "Describes the control it wraps, never takes focus, and never intercepts the pointer.",
    interactions: { click: ["harness-tooltip-control"] },
    assert: { topmost: "harness-tooltip-surface" },
  },
  {
    id: "toast-info",
    component: "ToastProvider",
    kind: "surface",
    state: "info",
    note: "A polite toast in the body-level region, promoted per batch so it lands above whatever was open.",
    interactions: { click: ["harness-toast-fire"] },
    assert: { topmost: "toast-region" },
  },
  {
    id: "toast-over-modal",
    component: "ToastProvider",
    kind: "surface",
    state: "over-modal",
    note: "A toast raised from inside a modal still draws above it, because it was promoted later.",
    interactions: { click: ["harness-toast-fire"] },
    assert: { topmost: "toast-region" },
  },
  {
    id: "dialog-hostile-z",
    component: "Dialog",
    kind: "surface",
    state: "hostile-z-index",
    note: "A sibling holds z-index 2147483647 — the largest CSS accepts — and still loses: the top layer does not compete with stacking contexts.",
    assert: { topmost: "harness-hostile-dialog" },
  },
  {
    id: "dialog-over-dialog",
    component: "Dialog",
    kind: "surface",
    state: "over-dialog",
    note: "The second dialog paints above the first, and Escape closes only the topmost.",
    interactions: { click: ["harness-open-b"] },
    assert: { topmost: "harness-dialog-b" },
  },
  {
    id: "dialog-menu-then-dialog",
    component: "Dialog",
    kind: "surface",
    state: "menu-under-later-dialog",
    note: "A menu belonging to the first dialog stays UNDER a second dialog opened later — the case a per-kind scale inverts.",
    interactions: { click: ["harness-mtd-menu-trigger", "harness-mtd-open-b"] },
    assert: { topmost: "harness-mtd-dialog-b" },
  },
  {
    id: "tooltip-over-toast",
    component: "Tooltip",
    kind: "surface",
    state: "over-toast",
    note: "Raised after the toast, so it paints above it: order is what the user did, not what the kinds are.",
    interactions: { click: ["harness-tot-fire", "harness-tot-control"] },
    assert: { topmost: "harness-tot-tip-surface" },
  },
  {
    id: "dialog-paint-contained",
    component: "Dialog",
    kind: "surface",
    state: "escapes-paint-containment",
    note: "Escapes contain:paint, content-visibility:auto and a filter ancestor — three containments no z-index survives.",
    assert: { topmost: "harness-contained-dialog", notClipped: "harness-contained-dialog" },
  },
  {
    id: "menu-in-scroller",
    component: "Menu",
    kind: "surface",
    state: "in-scroll-container",
    note: "The trigger lives in a 120px overflow:auto box; the surface escapes the clip and re-anchors when the box scrolls.",
    interactions: { click: ["harness-scroller-menu-trigger"] },
    assert: { topmost: "harness-scroller-menu-surface", notClipped: "harness-scroller-menu-surface" },
  },
  {
    id: "dialog-inert-background",
    component: "Dialog",
    kind: "surface",
    state: "inert-background",
    note: "With the modal open, the page behind it is inert: the counter button cannot be clicked or reached by Tab.",
    assert: { topmost: "harness-inert-dialog" },
  },
  {
    id: "portal-none",
    component: "Portal",
    kind: "structural",
    state: "none",
    note: "Renders its children into the body-level overlay host and nothing of its own.",
  },
  {
    id: "provider-none",
    component: "ProtoUIProvider",
    kind: "structural",
    state: "none",
    note: "Mounts the overlay stack and publishes the design tokens; renders no markup.",
  },
];

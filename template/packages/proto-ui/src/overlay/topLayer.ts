import type { Capabilities } from "./capabilities";

// @adr 008 - the only place the library calls a top-layer platform API
// promote/demote are the sole callers of showModal, close, showPopover and
// hidePopover in the whole library (layer:scan rule 9 enforces it). Keeping them
// here means the fallback path has one shape, and a browser that grows or loses an
// API changes one file.
//
// Why the top layer at all: an element promoted into it is painted above every
// stacking context in the document, so a hostile `z-index: 2147483647` in app code
// cannot compete, and an ancestor transform/filter/overflow cannot trap or clip it.
// Order within the top layer is promotion order, which is exactly the semantics an
// overlay stack needs: a dialog opened later is above, a popover raised from it is
// above that, and closing one returns the previous surface to the top.

export type PromoteMode = "modal" | "popover" | "hint";

/** The popover attribute value each mode uses. `hint` degrades to `manual` where unsupported. */
const POPOVER_ATTR: Record<Exclude<PromoteMode, "modal">, string> = { popover: "auto", hint: "hint" };

type DialogLike = HTMLElement & { showModal?: () => void; close?: () => void; open?: boolean };
type PopoverLike = HTMLElement & { showPopover?: () => void; hidePopover?: () => void };

/**
 * Put `el` in the top layer. A no-op when the platform cannot, which is not a
 * failure: the caller's fallback path renders the same surface through the portal
 * on the fallback layer scale, and the component's tests assert both.
 */
export function promote(el: HTMLElement, mode: PromoteMode, caps: Capabilities): void {
  if (mode === "modal") {
    const dialog = el as DialogLike;
    if (!caps.topLayerDialog || typeof dialog.showModal !== "function" || dialog.open === true) return;
    dialog.showModal();
    return;
  }

  const popover = el as PopoverLike;
  if (!caps.popover || typeof popover.showPopover !== "function") return;
  // The attribute has to be set before showPopover() or the call throws. Setting it
  // here rather than in JSX keeps the fallback markup free of an attribute that
  // would hide the element in a browser that half-supports the API.
  if (el.getAttribute("popover") === null) el.setAttribute("popover", POPOVER_ATTR[mode]);
  popover.showPopover();
}

/** Take `el` out of the top layer. Symmetric with promote, including the no-ops. */
export function demote(el: HTMLElement, mode: PromoteMode, caps: Capabilities): void {
  if (mode === "modal") {
    const dialog = el as DialogLike;
    if (!caps.topLayerDialog || typeof dialog.close !== "function" || dialog.open !== true) return;
    dialog.close();
    return;
  }

  const popover = el as PopoverLike;
  if (!caps.popover || typeof popover.hidePopover !== "function") return;
  popover.hidePopover();
}

/**
 * Is `el` currently in the top layer? Asked by the stack, not by components: a
 * component knows whether it wants to be open, and this answers whether the
 * platform agrees — which is how a light-dismissed popover is noticed.
 */
export function isPromoted(el: HTMLElement, mode: PromoteMode, caps: Capabilities): boolean {
  if (mode === "modal") {
    const dialog = el as DialogLike;
    return caps.topLayerDialog && dialog.open === true;
  }
  if (!caps.popover) return false;
  // :popover-open is the only honest answer — a flag of our own would go stale the
  // moment the browser light-dismisses an auto popover without telling us.
  return el.matches(":popover-open");
}

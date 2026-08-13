import type { Capabilities } from "./capabilities";

// @adr 008 - the only place the library calls a top-layer platform API
// promote/demote are the sole callers of showPopover and hidePopover in the whole
// library (layer:scan rule 9 enforces it).
//
// EVERY surface uses the same mechanism -- a manual popover -- including the modal.
// showModal() was tried first and is wrong here, for a reason only a browser could
// show: it marks the whole document outside the dialog as inert, and promoting a
// popover into the top layer does NOT lift that inertness. A menu or a toast raised
// from inside a modal was therefore visible but not hit-testable. One mechanism for
// all surfaces removes the interaction entirely, and the library already owns the
// pieces showModal() was providing -- useFocusScope traps, useInertBackground marks
// the app root ONLY, which is what leaves the overlay host usable.
//
// Why the top layer at all: an element promoted into it is painted above every
// stacking context in the document, so a hostile `z-index: 2147483647` in app code
// cannot compete, and an ancestor transform/filter/overflow cannot trap or clip it.
// Order within the top layer is promotion order, which is exactly the semantics an
// overlay stack needs: a dialog opened later is above, a popover raised from it is
// above that, and closing one returns the previous surface to the top.

export type PromoteMode = "popover";

/**
 * Always "manual", never "auto".
 *
 * An auto popover light-dismisses: the browser hides it on an outside click or Escape
 * WITHOUT telling React, so the DOM and the component's `open` state diverge and the
 * surface can never be reopened. Manual keeps React the owner of the state and keeps
 * dismissal with useDismiss, which is also the only place allowed to own it
 * (layer:scan rule 5). Same reasoning as Dialog intercepting the native `cancel`.
 */
const POPOVER_ATTR = "manual";

type PopoverLike = HTMLElement & { showPopover?: () => void; hidePopover?: () => void };

/**
 * Put `el` in the top layer. A no-op when the platform cannot, which is not a
 * failure: the caller's fallback path renders the same surface through the portal
 * on the fallback layer scale, and the component's tests assert both.
 */
export function promote(el: HTMLElement, caps: Capabilities): void {
  const popover = el as PopoverLike;
  if (!caps.popover || typeof popover.showPopover !== "function") return;
  // The attribute has to be set before showPopover() or the call throws. Setting it
  // here rather than in JSX keeps the fallback markup free of an attribute that
  // would hide the element in a browser that half-supports the API.
  if (el.getAttribute("popover") === null) el.setAttribute("popover", POPOVER_ATTR);
  popover.showPopover();
}

/** Take `el` out of the top layer. Symmetric with promote, including the no-ops. */
export function demote(el: HTMLElement, caps: Capabilities): void {
  const popover = el as PopoverLike;
  if (!caps.popover || typeof popover.hidePopover !== "function") return;
  popover.hidePopover();
}

/**
 * Is `el` currently in the top layer? Asked by the stack, not by components: a
 * component knows whether it wants to be open, and this answers whether the
 * platform agrees — which is how a light-dismissed popover is noticed.
 */
export function isPromoted(el: HTMLElement, caps: Capabilities): boolean {
  if (!caps.popover) return false;
  // :popover-open is the only honest answer — a flag of our own would go stale the
  // moment the browser light-dismisses an auto popover without telling us.
  return el.matches(":popover-open");
}

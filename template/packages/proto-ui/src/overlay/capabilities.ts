// @adr 008 - the single point of overlay feature detection
// Every "does this browser have X?" question in the library is answered here and
// nowhere else, so the fallback path has one switch rather than a scatter of
// typeof checks that can disagree with each other.
//
// `view` is a parameter with a default rather than a direct `window` reference:
// that is the seam a test uses to exercise the other branch without reaching for
// a global, and the seam OverlayStackProvider uses to pin capabilities in a test.

export type Capabilities = {
  /** `<dialog>.showModal()` — puts the surface in the browser's top layer. */
  topLayerDialog: boolean;
  /** The Popover API — top layer plus light dismiss for menus, toasts, tooltips. */
  popover: boolean;
  /** CSS anchor positioning, so a popover tracks its trigger without script. */
  cssAnchor: boolean;
};

// `view` is required rather than defaulted to `window`: a default would put a branch
// in here that no test running in a document can reach, and an unreachable branch is
// how a 100% floor starts needing exemptions.
export function detectCapabilities(view: Window): Capabilities {
  return {
    topLayerDialog: typeof view.HTMLDialogElement?.prototype?.showModal === "function",
    popover: typeof view.HTMLElement?.prototype?.showPopover === "function",
    cssAnchor: view.CSS?.supports?.("anchor-name: --probe") === true,
  };
}

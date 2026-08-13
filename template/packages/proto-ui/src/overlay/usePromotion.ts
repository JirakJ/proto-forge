import { useEffect, type RefObject } from "react";
import type { Capabilities } from "./capabilities";
import { demote, promote } from "./topLayer";

// @adr 008 - one effect owns "put this surface in the top layer while it is open"
//
// Dialog, Menu, ToastProvider and Tooltip all repeated the same three-line effect, and
// dup:scan rightly flagged the repetition: an identical block in four places is four
// chances for one of them to drift. The pairing matters — whoever promotes must demote
// on the same condition's cleanup, or a surface leaks into the top layer after close.
//
// `resignal` re-runs the pair (demote, then promote) while the surface stays open.
// Top-layer order is promotion order, so a surface whose CONTENT gains a new claim to
// be on top — a toast region receiving another toast after a dialog opened — must be
// re-promoted, or it keeps the position of its first batch forever.

export type UsePromotionOptions = {
  ref: RefObject<HTMLElement | null>;
  open: boolean;
  capabilities: Capabilities;
  /** Changing this while open re-runs the demote/promote pair. */
  resignal?: unknown;
};

export function usePromotion({ ref, open, capabilities, resignal }: UsePromotionOptions): void {
  useEffect(() => {
    const surface = ref.current;
    if (surface === null || !open) return;
    promote(surface, capabilities);
    return () => demote(surface, capabilities);
  }, [ref, open, capabilities, resignal]);
}

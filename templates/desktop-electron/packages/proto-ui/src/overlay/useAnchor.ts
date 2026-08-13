import { useCallback, useEffect, useId, useState, type RefObject } from "react";
import type { Capabilities } from "./capabilities";

// @adr 008 - anchoring a surface that is no longer next to its trigger
//
// A portalled surface has no offset parent in common with the button that opened it, so
// "just below the trigger" has to be computed in viewport coordinates — and recomputed,
// because the viewport moves. Two mechanisms, one API:
//
//   CSS anchor positioning   The browser tracks the trigger itself. No script, no
//                            listeners, and correct during a scroll it never told us
//                            about. Used when available.
//   Rect arithmetic          getBoundingClientRect on open, re-run on resize and on
//                            scroll in ANY ancestor (capture phase, which is why the
//                            listener is registered with `true`).
//
// Generalised out of Menu, which had the second half inline. The first half is why the
// hook takes capabilities rather than reading them: the choice belongs to the tree, and
// a test needs to exercise both.

export type Placement = "block-end-start" | "block-start-start";

export type Position = { insetBlockStart: number; insetInlineStart: number };

/**
 * How CSS anchor positioning expresses each placement. A function rather than a record
 * lookup: an indexed read on a caller-supplied key is an object-injection sink, and a
 * warning nobody can act on is a warning everybody learns to ignore.
 */
const positionArea = (placement: Placement) =>
  placement === "block-end-start" ? "block-end span-inline-end" : "block-start span-inline-end";

export type UseAnchorOptions = {
  triggerRef: RefObject<HTMLElement | null>;
  surfaceRef: RefObject<HTMLElement | null>;
  open: boolean;
  placement?: Placement;
  capabilities: Capabilities;
};

/**
 * Returns the viewport coordinates the caller should apply, or `null` — while closed,
 * and whenever CSS anchor positioning is doing the work instead. A `null` is not a
 * failure: it means "do not set an inset", which is exactly right in both cases.
 */
export function useAnchor({
  triggerRef,
  surfaceRef,
  open,
  placement = "block-end-start",
  capabilities,
}: UseAnchorOptions): Position | null {
  const reactId = useId();
  const [position, setPosition] = useState<Position | null>(null);

  const place = useCallback(() => {
    const trigger = triggerRef.current;
    if (trigger === null) return;
    const rect = trigger.getBoundingClientRect();
    setPosition({
      insetBlockStart: placement === "block-end-start" ? rect.bottom : rect.top,
      insetInlineStart: rect.left,
    });
  }, [triggerRef, placement]);

  useEffect(() => {
    if (!open) {
      setPosition(null);
      return;
    }

    if (capabilities.cssAnchor) {
      const trigger = triggerRef.current;
      const surface = surfaceRef.current;
      if (trigger === null || surface === null) return;
      // A dashed-ident per hook instance, so two menus on one page cannot anchor to
      // each other's trigger. useId's value contains characters a custom ident may not.
      const name = `--pf-anchor-${reactId.replace(/[^a-zA-Z0-9-]/g, "")}`;
      trigger.style.setProperty("anchor-name", name);
      surface.style.setProperty("position-anchor", name);
      surface.style.setProperty("position-area", positionArea(placement));
      return () => {
        trigger.style.removeProperty("anchor-name");
        surface.style.removeProperty("position-anchor");
        surface.style.removeProperty("position-area");
      };
    }

    place();
    window.addEventListener("resize", place);
    // `true`: a scroll in any ancestor moves the trigger, and scroll does not bubble.
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, capabilities.cssAnchor, reactId, placement, place, triggerRef, surfaceRef]);

  return capabilities.cssAnchor ? null : position;
}

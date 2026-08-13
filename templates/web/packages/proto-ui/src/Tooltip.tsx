import { cloneElement, useCallback, useId, useRef, useState, type ReactElement } from "react";
import { tokens } from "../tokens";
import { Portal } from "./Portal";
import { useAnchor, useDismiss, useOverlaySlot, usePromotion } from "./overlay/index";

export type TooltipProps = {
  /** The description. Already translated by the caller — never a literal (BR-08). */
  label: string;
  /** The control being described. Receives `aria-describedby` while the tooltip is up. */
  children: ReactElement<{ "aria-describedby"?: string }>;
  "data-testid": string;
};

// @adr 008 - a tooltip is a surface like any other, and takes no focus
//
// Promoted into the top layer through the same adapter as every other surface, so it
// paints above whatever was already open — including a toast, which is the case the
// per-kind scale used to get right by accident and would have got wrong as soon as the
// toast was raised second.
//
// What makes a tooltip different is what it must NOT do: it never takes focus, never
// traps it, and never blocks the page. So it composes useOverlaySlot, promote/demote,
// useAnchor and useDismiss — and deliberately not useFocusScope, useScrollLock or
// useInertBackground (NFR-23: a consumer does not depend on what it does not use).
//
// `aria-describedby` goes on the CONTROL, not on the wrapper: a screen reader announces
// the description of the element that has focus, and the wrapper is not it. That is why
// the child is cloned rather than merely wrapped.
export function Tooltip({ label, children, "data-testid": testid }: TooltipProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLSpanElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const surfaceId = useId();
  const slot = useOverlaySlot("tooltip", open);
  const { capabilities } = slot;
  const position = useAnchor({ triggerRef, surfaceRef, open, capabilities });

  const show = useCallback(() => setOpen(true), []);
  const hide = useCallback(() => setOpen(false), []);

  usePromotion({ ref: surfaceRef, open, capabilities });

  // Escape dismisses, because a tooltip that will not go away is worse than no tooltip.
  // No outside-pointer dismissal: pointer-leave already covers it, and claiming outside
  // clicks would let a tooltip swallow the click a dialog underneath wanted.
  useDismiss({ ref: surfaceRef, slot, onDismiss: hide, enabled: open, outsidePointer: false });

  return (
    <>
      <span
        ref={triggerRef}
        data-testid={`${testid}-trigger`}
        style={{ display: "inline-block" }}
        onPointerEnter={show}
        onPointerLeave={hide}
        onFocus={show}
        onBlur={hide}
      >
        {cloneElement(children, open ? { "aria-describedby": surfaceId } : {})}
      </span>
      {open ? (
        <Portal>
          <div
            ref={surfaceRef}
            id={surfaceId}
            role="tooltip"
            data-testid={`${testid}-surface`}
            style={{
              position: "fixed",
              zIndex: slot.fallbackZIndex,
              ...(position ?? {}),
              marginBlockStart: tokens.space.xs,
              maxInlineSize: "260px",
              padding: `${tokens.space.xs} ${tokens.space.sm}`,
              background: tokens.color.fg,
              color: tokens.color.primaryFg,
              borderRadius: tokens.radius.sm,
              fontSize: tokens.font.sizeSm,
              // Never in the way of the pointer: a tooltip that intercepts clicks is a
              // tooltip that breaks the control it is describing.
              pointerEvents: "none",
            }}
          >
            {label}
          </div>
        </Portal>
      ) : null}
    </>
  );
}

import { useEffect, useRef, type ReactNode } from "react";
import { tokens } from "../tokens";
import { Portal } from "./Portal";
import {
  demote,
  isPromoted,
  promote,
  useDismiss,
  useFocusScope,
  useInertBackground,
  useOverlaySlot,
  useScrollLock,
} from "./overlay/index";

export type DialogProps = {
  open: boolean;
  onClose: () => void;
  /** Accessible name. Already translated by the caller — never a literal (BR-08). */
  title: string;
  children: ReactNode;
  "data-testid": string;
};

// @adr 008 - a modal that is on top because the browser put it there
//
// The surface is a real <dialog>, opened with showModal(), which places it in the
// browser's TOP LAYER. That is a different guarantee from a high z-index: the top layer
// is not part of the document's stacking contexts, so an ancestor transform, filter or
// overflow cannot trap or clip it, and a hostile `z-index: 2147483647` in application
// code cannot compete with it at all. Order within the top layer is promotion order,
// which is why two dialogs stack correctly with no arithmetic.
//
// Everything else is composed rather than built here (NFR-20). Dialog owns no listener,
// no focus trap and no scroll bookkeeping of its own:
//
//   useOverlaySlot        place in the stack, and the fallback z-index
//   promote / demote      the only platform calls
//   useFocusScope         entry and return; trapping only where the platform does not
//   useScrollLock         refcounted, so two dialogs do not unlock each other's page
//   useInertBackground    only on the fallback path; showModal() inerts natively
//   useDismiss            Escape via the topmost surface only
//
// The fallback path (a browser, or jsdom, without showModal) renders the SAME <dialog>
// element with its `open` attribute set, plus a scrim element of its own, and takes over
// focus trapping, inerting and Escape. Same markup and same testids either way, so one
// test contract covers both (NFR-24).
export function Dialog({ open, onClose, title, children, "data-testid": testid }: DialogProps) {
  const surfaceRef = useRef<HTMLDialogElement>(null);
  const slot = useOverlaySlot("modal", open);
  const { capabilities } = slot;
  // Whether the PLATFORM will place this surface. Decided at render time so the scrim is
  // not added and removed after the fact, which would flash.
  const platformOwnsLayering = capabilities.topLayerDialog;

  useEffect(() => {
    const surface = surfaceRef.current;
    if (surface === null || !open) return;
    promote(surface, "modal", capabilities);
    // Not promoted means the platform declined — a browser without showModal, or a test
    // pinning the capability on an element that does not implement it. Showing the
    // element non-modally keeps it visible and keeps `role=dialog` addressable.
    if (!isPromoted(surface, "modal", capabilities)) surface.setAttribute("open", "");
    return () => {
      demote(surface, "modal", capabilities);
      surface.removeAttribute("open");
    };
  }, [open, capabilities]);

  useFocusScope({ ref: surfaceRef, active: open, trap: !platformOwnsLayering });
  useScrollLock(open);
  useInertBackground(open && !platformOwnsLayering);
  useDismiss({
    ref: surfaceRef,
    slot,
    onDismiss: onClose,
    enabled: open,
    // On the top-layer path the native `cancel` event owns Escape; handling it twice
    // would close two levels of a stack on one keystroke.
    escape: !platformOwnsLayering,
    // A modal's outside click is its scrim's click, handled below, so that the dialog
    // does not also close on a click landing in the browser's own backdrop.
    outsidePointer: false,
  });

  if (!open) return null;

  return (
    <Portal>
      {platformOwnsLayering ? null : (
        <div
          data-testid={`${testid}-scrim`}
          onClick={onClose}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: slot.fallbackZIndex,
            background: tokens.color.scrim,
          }}
        />
      )}
      <dialog
        ref={surfaceRef}
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        data-testid={testid}
        onCancel={(event) => {
          // Keep React the owner of `open`: letting the browser close the element would
          // leave the DOM and the prop disagreeing.
          event.preventDefault();
          onClose();
        }}
        onClick={(event) => event.stopPropagation()}
        style={
          platformOwnsLayering
            ? { background: tokens.color.bg, color: tokens.color.fg, padding: tokens.space.lg }
            : {
                position: "fixed",
                zIndex: slot.fallbackZIndex + 1,
                insetBlockStart: "50%",
                insetInlineStart: "50%",
                transform: "translate(-50%, -50%)",
                margin: 0,
                border: 0,
                background: tokens.color.bg,
                color: tokens.color.fg,
                padding: tokens.space.lg,
                borderRadius: tokens.radius.md,
                minWidth: "280px",
              }
        }
      >
        <h2 data-testid={`${testid}-title`} style={{ fontSize: tokens.font.sizeLg, marginBlockStart: 0 }}>
          {title}
        </h2>
        {children}
      </dialog>
    </Portal>
  );
}

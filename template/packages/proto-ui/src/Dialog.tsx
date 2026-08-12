import { useRef, type ReactNode } from "react";
import { tokens } from "../tokens";
import { Portal } from "./Portal";
import {
  useDismiss,
  useFocusScope,
  useInertBackground,
  useOverlaySlot,
  useScrollLock,
  usePromotion,
  type OverlaySlot,
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
// The surface is promoted into the browser's TOP LAYER as a manual popover. That is a
// different guarantee from a high z-index: the top layer is not part of the document's
// stacking contexts, so an ancestor transform, filter or overflow cannot trap or clip
// it, and a hostile `z-index: 2147483647` in application code cannot compete with it at
// all. Order within the top layer is promotion order, which is why two dialogs stack
// correctly with no arithmetic.
//
// Not showModal(). That was the first design and a browser test refuted it: showModal()
// marks the whole document outside the dialog inert, and promoting a popover does not
// lift that inertness, so a menu or toast raised from inside a modal was visible but
// dead to the pointer. One mechanism for every surface removes the interaction.
//
// Everything else is composed rather than built here (NFR-20). Dialog owns no listener,
// no focus trap and no scroll bookkeeping of its own:
//
//   useOverlaySlot        place in the stack, and the fallback z-index
//   promote / demote      the only platform calls
//   useFocusScope         entry, containment and return
//   useScrollLock         refcounted, so two dialogs do not unlock each other's page
//   useInertBackground    the app root only, which is what keeps a menu above the modal
//                         reachable -- the thing showModal() got wrong
//   useDismiss            Escape via the topmost surface only
//
// The fallback path (no Popover API) renders the same element with its own scrim and its
// own layer from the stack. Same markup, same testids, same behaviour, so one test
// contract covers both (NFR-24).
// Style construction lives outside the component: the render function's lines should
// be behaviour, and NFR-20's per-function ceiling is what keeps it that way. The
// factories take the SLOT, not a number, so the z-index expression at the style site
// stays `slot.fallbackZIndex` — the exact shape layer:scan rule 1 admits.
const scrimStyle = (slot: OverlaySlot) =>
  ({ position: "fixed", inset: 0, zIndex: slot.fallbackZIndex, background: tokens.color.scrim }) as const;

const surfaceStyle = (platformOwnsLayering: boolean, slot: OverlaySlot) =>
  platformOwnsLayering
    ? ({ background: tokens.color.bg, color: tokens.color.fg, padding: tokens.space.lg } as const)
    : ({
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
      } as const);

export function Dialog({ open, onClose, title, children, "data-testid": testid }: DialogProps) {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const slot = useOverlaySlot("modal", open);
  const { capabilities } = slot;
  // Whether the PLATFORM will place this surface. Decided at render time so the scrim is
  // not added and removed after the fact, which would flash. On the platform path the
  // scrim is ::backdrop; on the fallback it is an element of our own.
  const platformOwnsLayering = capabilities.popover;

  usePromotion(surfaceRef, open, capabilities);

  // The library owns all three, on both paths. A manual popover gives no native focus
  // containment and no native inertness -- deliberately, because the native versions
  // came bundled with an inertness that broke every surface above the modal.
  useFocusScope({ ref: surfaceRef, active: open, trap: true });
  useScrollLock(open);
  useInertBackground(open);
  useDismiss({
    ref: surfaceRef,
    slot,
    onDismiss: onClose,
    enabled: open,
    // A modal's outside click is its scrim's click, handled below, so the dialog does
    // not also close on a click that lands on the backdrop.
    outsidePointer: false,
  });

  if (!open) return null;

  return (
    <Portal>
      {platformOwnsLayering ? null : (
        <div data-testid={`${testid}-scrim`} onClick={onClose} style={scrimStyle(slot)} />
      )}
      <div
        ref={surfaceRef}
        role="dialog"
        aria-modal="true"
        data-pf-modal=""
        aria-label={title}
        tabIndex={-1}
        data-testid={testid}
        onClick={(event) => event.stopPropagation()}
        style={surfaceStyle(platformOwnsLayering, slot)}
      >
        <h2 data-testid={`${testid}-title`} style={{ fontSize: tokens.font.sizeLg, marginBlockStart: 0 }}>
          {title}
        </h2>
        {children}
      </div>
    </Portal>
  );
}

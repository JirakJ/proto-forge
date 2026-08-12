import { useCallback, useRef, useState } from "react";
import { tokens } from "../tokens";
import { Portal } from "./Portal";
import { useAnchor, useDismiss, useFocusScope, useOverlaySlot, usePromotion } from "./overlay/index";

/** `label` is already translated by the caller — never a literal (BR-08). */
export type MenuItem = { id: string; label: string; onSelect: () => void };
export type MenuProps = { label: string; items: MenuItem[]; "data-testid": string };

// @adr 008 - a menu that is above its own dialog, and below a later one
//
// The surface is promoted into the browser's top layer through the Popover API, so paint
// order is promotion order: a menu opened inside a dialog draws above it, and a dialog
// opened after the menu draws above the menu. A per-kind scale could not express that
// second half — it ranked every popover above every modal, forever.
//
// Composed, not built here (NFR-20): useOverlaySlot for position in the stack,
// promote/demote for the platform call, useAnchor for tracking the trigger in viewport
// coordinates (a portalled surface shares no offset parent with it), useFocusScope for
// entry and return, useDismiss for Escape and outside pointers — topmost only.
// Styles and the per-item row live outside Menu so its lines are behaviour (NFR-20).
const triggerStyle = {
  padding: `${tokens.space.sm} ${tokens.space.md}`,
  border: `1px solid ${tokens.color.border}`,
  borderRadius: tokens.radius.sm,
  background: tokens.color.bg,
  color: tokens.color.fg,
  cursor: "pointer",
} as const;

const itemStyle = {
  display: "block",
  inlineSize: "100%",
  textAlign: "start",
  padding: tokens.space.sm,
  border: "none",
  background: "none",
  cursor: "pointer",
  color: tokens.color.fg,
} as const;

function MenuEntry({ item, testid, onPick }: { item: MenuItem; testid: string; onPick: () => void }) {
  return (
    <li role="none" data-testid={`${testid}-option-${item.id}`}>
      <button
        role="menuitem"
        data-testid={`${testid}-item-${item.id}`}
        onClick={() => {
          item.onSelect();
          onPick();
        }}
        style={itemStyle}
      >
        {item.label}
      </button>
    </li>
  );
}

export function Menu({ label, items, "data-testid": testid }: MenuProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const surfaceRef = useRef<HTMLUListElement>(null);
  const slot = useOverlaySlot("popover", open);
  const { capabilities } = slot;
  const position = useAnchor({ triggerRef, surfaceRef, open, capabilities });

  const close = useCallback(() => setOpen(false), []);

  usePromotion(surfaceRef, open, capabilities);

  // No trap: a menu is not modal, and the page behind it stays operable.
  useFocusScope({ ref: surfaceRef, active: open, trap: false, initialFocus: "first" });
  useDismiss({ ref: surfaceRef, ignore: triggerRef, slot, onDismiss: close, enabled: open });

  return (
    <>
      <button
        ref={triggerRef}
        aria-haspopup="menu"
        aria-expanded={open}
        data-testid={`${testid}-trigger`}
        onClick={() => setOpen((current) => !current)}
        style={triggerStyle}
      >
        {label}
      </button>
      {open ? (
        <Portal>
          <ul
            ref={surfaceRef}
            role="menu"
            aria-label={label}
            data-testid={`${testid}-surface`}
            style={{
              position: "fixed",
              zIndex: slot.fallbackZIndex,
              // null while CSS anchor positioning is doing the work, or before the first
              // measurement; the browser places the surface in that case.
              ...(position ?? {}),
              marginBlockStart: tokens.space.xs,
              listStyle: "none",
              padding: tokens.space.xs,
              background: tokens.color.bg,
              border: `1px solid ${tokens.color.border}`,
              borderRadius: tokens.radius.sm,
              minWidth: "160px",
            }}
          >
            {items.map((item) => (
              <MenuEntry key={item.id} item={item} testid={testid} onPick={close} />
            ))}
          </ul>
        </Portal>
      ) : null}
    </>
  );
}

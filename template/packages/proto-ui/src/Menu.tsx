import { useCallback, useEffect, useRef, useState } from "react";
import { tokens } from "../tokens";
import { Portal } from "./Portal";

/** `label` is already translated by the caller — never a literal (BR-08). */
export type MenuItem = { id: string; label: string; onSelect: () => void };
export type MenuProps = { label: string; items: MenuItem[]; "data-testid": string };

type Anchor = { top: number; left: number };

// Menu button: aria-haspopup + aria-expanded toggle a role=menu of menuitems.
// The surface renders in the body-level portal at tokens.layer.popover — above a
// modal, so a menu opened inside a dialog is still usable — and is anchored to the
// trigger in viewport coordinates, since a portalled surface has no offset parent.
// Escape or a pointer outside closes and returns focus to the trigger.
export function Menu({ label, items, "data-testid": testid }: MenuProps) {
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const surfaceRef = useRef<HTMLUListElement>(null);
  const open = anchor !== null;

  const place = useCallback(() => {
    const rect = triggerRef.current!.getBoundingClientRect();
    setAnchor({ top: rect.bottom, left: rect.left });
  }, []);

  const close = useCallback(() => {
    setAnchor(null);
    triggerRef.current!.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    // Focus enters the surface: portalled content sits at the end of the document,
    // so without this the keyboard path would skip the whole app to reach it.
    surfaceRef.current!.querySelector("button")?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    const onPointerDown = (e: Event) => {
      const target = e.target as Node;
      if (!triggerRef.current!.contains(target) && !surfaceRef.current!.contains(target)) close();
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    // Re-anchor rather than drift: `true` catches scrolls in any ancestor.
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, close, place]);

  return (
    <>
      <button
        ref={triggerRef}
        aria-haspopup="menu"
        aria-expanded={open}
        data-testid={`${testid}-trigger`}
        onClick={() => (open ? close() : place())}
        style={{
          padding: `${tokens.space.sm} ${tokens.space.md}`,
          border: `1px solid ${tokens.color.border}`,
          borderRadius: tokens.radius.sm,
          background: tokens.color.bg,
          color: tokens.color.fg,
          cursor: "pointer",
        }}
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
              zIndex: tokens.layer.popover,
              insetBlockStart: anchor.top,
              insetInlineStart: anchor.left,
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
              <li key={item.id} role="none" data-testid={`${testid}-option-${item.id}`}>
                <button
                  role="menuitem"
                  data-testid={`${testid}-item-${item.id}`}
                  onClick={() => {
                    item.onSelect();
                    close();
                  }}
                  style={{
                    display: "block",
                    inlineSize: "100%",
                    textAlign: "start",
                    padding: tokens.space.sm,
                    border: "none",
                    background: "none",
                    cursor: "pointer",
                    color: tokens.color.fg,
                  }}
                >
                  {item.label}
                </button>
              </li>
            ))}
          </ul>
        </Portal>
      ) : null}
    </>
  );
}

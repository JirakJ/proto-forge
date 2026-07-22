import { useState, type KeyboardEvent } from "react";
import { tokens } from "../tokens";

export type MenuItem = { id: string; label: string; onSelect: () => void };
export type MenuProps = { label: string; items: MenuItem[]; "data-testid"?: string };

// Menu button: aria-haspopup + aria-expanded toggle a role=menu of menuitems.
// Escape closes; selecting an item runs its action and closes.
export function Menu({ label, items, "data-testid": testid }: MenuProps) {
  const [open, setOpen] = useState(false);

  const onKeyDown = (e: KeyboardEvent<HTMLUListElement>) => {
    if (e.key === "Escape") setOpen(false);
  };

  return (
    <div style={{ position: "relative", display: "inline-block" }} data-testid={testid}>
      <button
        aria-haspopup="menu"
        aria-expanded={open}
        data-testid="menu-trigger"
        onClick={() => setOpen((o) => !o)}
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
        <ul
          role="menu"
          aria-label={label}
          onKeyDown={onKeyDown}
          style={{
            position: "absolute",
            insetInlineStart: 0,
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
            <li key={item.id} role="none">
              <button
                role="menuitem"
                data-testid={`menu-item-${item.id}`}
                onClick={() => {
                  item.onSelect();
                  setOpen(false);
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
      ) : null}
    </div>
  );
}

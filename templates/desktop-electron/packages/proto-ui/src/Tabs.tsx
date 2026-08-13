import { useId, useState, type KeyboardEvent, type ReactNode } from "react";
import { tokens } from "../tokens";

/** `label` is already translated by the caller — never a literal (BR-08). */
export type TabItem = { id: string; label: string; content: ReactNode };
export type TabsProps = { tabs: TabItem[]; "data-testid": string };

// Accessible tabs: role=tablist/tab/tabpanel, roving tabindex, Arrow-key navigation.
// Tab and panel testids are namespaced by the component's own testid so two Tabs
// on one page never collide (BR-02).
export function Tabs({ tabs, "data-testid": testid }: TabsProps) {
  const [active, setActive] = useState(0);
  const base = useId();

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "ArrowRight") setActive((i) => (i + 1) % tabs.length);
    else if (e.key === "ArrowLeft") setActive((i) => (i - 1 + tabs.length) % tabs.length);
    else return;
    e.preventDefault();
  };

  return (
    <div data-testid={testid}>
      <div
        role="tablist"
        data-testid={`${testid}-tablist`}
        onKeyDown={onKeyDown}
        style={{ display: "flex", gap: tokens.space.sm, borderBlockEnd: `1px solid ${tokens.color.border}` }}
      >
        {tabs.map((tab, i) => {
          const selected = i === active;
          return (
            <button
              key={tab.id}
              role="tab"
              id={`${base}-tab-${i}`}
              aria-selected={selected}
              aria-controls={`${base}-panel-${i}`}
              tabIndex={selected ? 0 : -1}
              data-testid={`${testid}-tab-${tab.id}`}
              onClick={() => setActive(i)}
              style={{
                padding: tokens.space.sm,
                border: "none",
                background: "none",
                cursor: "pointer",
                color: selected ? tokens.color.primary : tokens.color.fg,
                borderBlockEnd: selected ? `2px solid ${tokens.color.primary}` : "2px solid transparent",
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
      {tabs.map((tab, i) => (
        <div
          key={tab.id}
          role="tabpanel"
          id={`${base}-panel-${i}`}
          aria-labelledby={`${base}-tab-${i}`}
          hidden={i !== active}
          data-testid={`${testid}-panel-${tab.id}`}
          style={{ padding: tokens.space.md }}
        >
          {tab.content}
        </div>
      ))}
    </div>
  );
}

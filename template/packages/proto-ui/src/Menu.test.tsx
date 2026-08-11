import { render, screen, fireEvent } from "@testing-library/react";
import { Menu, type MenuItem } from "./Menu";
import { OVERLAY_ROOT_ID } from "./Portal";
import { tokens } from "../tokens";

function setup(items?: MenuItem[]) {
  const picked: string[] = [];
  const list: MenuItem[] = items ?? [
    { id: "edit", label: "Edit", onSelect: () => picked.push("edit") },
    { id: "del", label: "Delete", onSelect: () => picked.push("del") },
  ];
  render(<Menu label="Actions" items={list} data-testid="menu" />);
  return { picked };
}

describe("Menu", () => {
  it("is collapsed by default", () => {
    setup();
    expect(screen.getByTestId("menu-trigger")).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("opens on trigger click and selects an item, then closes and restores focus", () => {
    const { picked } = setup();
    const trigger = screen.getByTestId("menu-trigger");
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(screen.getByTestId("menu-item-edit"));
    expect(picked).toEqual(["edit"]);
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("toggles closed when the trigger is clicked again", () => {
    setup();
    const trigger = screen.getByTestId("menu-trigger");
    fireEvent.click(trigger);
    expect(screen.getByRole("menu")).toBeInTheDocument();
    fireEvent.click(trigger);
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("closes on Escape but stays open on other keys", () => {
    setup();
    fireEvent.click(screen.getByTestId("menu-trigger"));
    fireEvent.keyDown(document, { key: "x" });
    expect(screen.getByRole("menu")).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("closes on a pointer outside, but not on one inside the trigger or the surface", () => {
    setup();
    const trigger = screen.getByTestId("menu-trigger");
    fireEvent.click(trigger);

    fireEvent.pointerDown(trigger); // inside the trigger
    expect(screen.getByRole("menu")).toBeInTheDocument();

    fireEvent.pointerDown(screen.getByTestId("menu-item-edit")); // inside the surface
    expect(screen.getByRole("menu")).toBeInTheDocument();

    fireEvent.pointerDown(document.body); // outside both
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("renders the surface in the body-level portal above the modal layer", () => {
    setup();
    fireEvent.click(screen.getByTestId("menu-trigger"));
    const surface = screen.getByTestId("menu-surface");
    expect(document.getElementById(OVERLAY_ROOT_ID)).toContainElement(surface);
    expect(surface).toHaveStyle({ position: "fixed", zIndex: String(tokens.layer.popover) });
    expect(tokens.layer.popover).toBeGreaterThan(tokens.layer.modal);
  });

  it("moves focus into the surface on open, and copes with an empty menu", () => {
    setup();
    fireEvent.click(screen.getByTestId("menu-trigger"));
    expect(document.activeElement).toBe(screen.getByTestId("menu-item-edit"));

    fireEvent.keyDown(document, { key: "Escape" });
    fireEvent.click(screen.getByTestId("menu-trigger"));
    expect(screen.getByRole("menu")).toBeInTheDocument();
  });

  it("opens an empty menu without throwing when there is nothing to focus", () => {
    setup([]);
    fireEvent.click(screen.getByTestId("menu-trigger"));
    expect(screen.getByRole("menu")).toBeEmptyDOMElement();
  });

  it("re-anchors to the trigger when the viewport changes", () => {
    setup();
    const trigger = screen.getByTestId("menu-trigger");
    trigger.getBoundingClientRect = () => ({ bottom: 40, left: 12 }) as DOMRect;
    fireEvent.click(trigger);
    expect(screen.getByTestId("menu-surface")).toHaveStyle({ insetBlockStart: "40px", insetInlineStart: "12px" });

    trigger.getBoundingClientRect = () => ({ bottom: 90, left: 30 }) as DOMRect;
    fireEvent(window, new Event("resize"));
    expect(screen.getByTestId("menu-surface")).toHaveStyle({ insetBlockStart: "90px", insetInlineStart: "30px" });

    trigger.getBoundingClientRect = () => ({ bottom: 5, left: 7 }) as DOMRect;
    fireEvent.scroll(window);
    expect(screen.getByTestId("menu-surface")).toHaveStyle({ insetBlockStart: "5px", insetInlineStart: "7px" });
  });
});

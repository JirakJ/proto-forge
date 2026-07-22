import { render, screen, fireEvent } from "@testing-library/react";
import { Menu, type MenuItem } from "./Menu";

function setup() {
  const picked: string[] = [];
  const items: MenuItem[] = [
    { id: "edit", label: "Edit", onSelect: () => picked.push("edit") },
    { id: "del", label: "Delete", onSelect: () => picked.push("del") },
  ];
  render(<Menu label="Actions" items={items} data-testid="menu" />);
  return { picked };
}

describe("Menu", () => {
  it("is collapsed by default", () => {
    setup();
    expect(screen.getByTestId("menu-trigger")).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("opens on trigger click and selects an item, then closes", () => {
    const { picked } = setup();
    fireEvent.click(screen.getByTestId("menu-trigger"));
    expect(screen.getByTestId("menu-trigger")).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(screen.getByTestId("menu-item-edit"));
    expect(picked).toEqual(["edit"]);
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("closes on Escape but stays open on other keys", () => {
    setup();
    fireEvent.click(screen.getByTestId("menu-trigger"));
    fireEvent.keyDown(screen.getByRole("menu"), { key: "x" });
    expect(screen.getByRole("menu")).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
  });
});

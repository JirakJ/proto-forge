import { render, screen, fireEvent } from "@testing-library/react";
import { Tabs, type TabItem } from "./Tabs";

const tabs: TabItem[] = [
  { id: "a", label: "A", content: <p>Content A</p> },
  { id: "b", label: "B", content: <p>Content B</p> },
  { id: "c", label: "C", content: <p>Content C</p> },
];

describe("Tabs", () => {
  it("selects the first tab by default and shows its panel", () => {
    render(<Tabs tabs={tabs} data-testid="tabs" />);
    expect(screen.getByTestId("tab-a")).toHaveAttribute("aria-selected", "true");
    expect(screen.getByTestId("tab-b")).toHaveAttribute("aria-selected", "false");
    expect(screen.getByTestId("panel-a")).not.toHaveAttribute("hidden");
    expect(screen.getByTestId("panel-b")).toHaveAttribute("hidden");
  });

  it("activates a tab on click", () => {
    render(<Tabs tabs={tabs} />);
    fireEvent.click(screen.getByTestId("tab-b"));
    expect(screen.getByTestId("tab-b")).toHaveAttribute("aria-selected", "true");
    expect(screen.getByTestId("panel-b")).not.toHaveAttribute("hidden");
  });

  it("moves with arrow keys (wrapping) and ignores other keys", () => {
    render(<Tabs tabs={tabs} />);
    const tablist = screen.getByRole("tablist");
    fireEvent.keyDown(tablist, { key: "ArrowRight" }); // 0 -> 1
    expect(screen.getByTestId("tab-b")).toHaveAttribute("aria-selected", "true");
    fireEvent.keyDown(tablist, { key: "ArrowLeft" }); // 1 -> 0
    expect(screen.getByTestId("tab-a")).toHaveAttribute("aria-selected", "true");
    fireEvent.keyDown(tablist, { key: "ArrowLeft" }); // 0 -> 2 (wrap)
    expect(screen.getByTestId("tab-c")).toHaveAttribute("aria-selected", "true");
    fireEvent.keyDown(tablist, { key: "x" }); // ignored
    expect(screen.getByTestId("tab-c")).toHaveAttribute("aria-selected", "true");
  });
});

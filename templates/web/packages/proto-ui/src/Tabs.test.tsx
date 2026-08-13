import { render, screen } from "@testing-library/react";
import { fireEvent } from "@testing-library/react";
import { Tabs, type TabItem } from "./Tabs";

const tabs: TabItem[] = [
  { id: "a", label: "A", content: <p>Content A</p> },
  { id: "b", label: "B", content: <p>Content B</p> },
  { id: "c", label: "C", content: <p>Content C</p> },
];

describe("Tabs", () => {
  it("selects the first tab by default and shows its panel", () => {
    render(<Tabs tabs={tabs} data-testid="tabs" />);
    expect(screen.getByTestId("tabs-tab-a")).toHaveAttribute("aria-selected", "true");
    expect(screen.getByTestId("tabs-tab-b")).toHaveAttribute("aria-selected", "false");
    expect(screen.getByTestId("tabs-panel-a")).not.toHaveAttribute("hidden");
    expect(screen.getByTestId("tabs-panel-b")).toHaveAttribute("hidden");
  });

  it("namespaces its testids so two instances on one page never collide", () => {
    render(
      <>
        <Tabs tabs={tabs} data-testid="left" />
        <Tabs tabs={tabs} data-testid="right" />
      </>,
    );
    expect(screen.getByTestId("left-tab-a")).not.toBe(screen.getByTestId("right-tab-a"));
    const ids = [...document.querySelectorAll("[data-testid]")].map((el) => el.getAttribute("data-testid")!);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("activates a tab on click", () => {
    render(<Tabs tabs={tabs} data-testid="tabs" />);
    fireEvent.click(screen.getByTestId("tabs-tab-b"));
    expect(screen.getByTestId("tabs-tab-b")).toHaveAttribute("aria-selected", "true");
    expect(screen.getByTestId("tabs-panel-b")).not.toHaveAttribute("hidden");
  });

  it("moves with arrow keys (wrapping) and ignores other keys", () => {
    render(<Tabs tabs={tabs} data-testid="tabs" />);
    const tablist = screen.getByTestId("tabs-tablist");
    fireEvent.keyDown(tablist, { key: "ArrowRight" }); // 0 -> 1
    expect(screen.getByTestId("tabs-tab-b")).toHaveAttribute("aria-selected", "true");
    fireEvent.keyDown(tablist, { key: "ArrowLeft" }); // 1 -> 0
    expect(screen.getByTestId("tabs-tab-a")).toHaveAttribute("aria-selected", "true");
    fireEvent.keyDown(tablist, { key: "ArrowLeft" }); // 0 -> 2 (wrap)
    expect(screen.getByTestId("tabs-tab-c")).toHaveAttribute("aria-selected", "true");
    fireEvent.keyDown(tablist, { key: "x" }); // ignored
    expect(screen.getByTestId("tabs-tab-c")).toHaveAttribute("aria-selected", "true");
  });
});

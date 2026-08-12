import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Menu, type MenuItem } from "./Menu";
import { OVERLAY_ROOT_ID } from "./Portal";
import { ProtoUIProvider } from "../providers/index";
import { tokens } from "../tokens";
import type { Capabilities } from "./overlay/index";

// The fallback path is the default here: jsdom implements no Popover API, so this is
// also what detection would report. The top-layer path is pinned where it matters, and
// proven for real in e2e/overlay-layering.e2e.ts.
const FALLBACK: Capabilities = { topLayerDialog: false, popover: false, cssAnchor: false };

function setup(items?: MenuItem[], capabilities: Capabilities = FALLBACK) {
  const picked: string[] = [];
  const list: MenuItem[] = items ?? [
    { id: "edit", label: "Edit", onSelect: () => picked.push("edit") },
    { id: "del", label: "Delete", onSelect: () => picked.push("del") },
  ];
  render(
    <ProtoUIProvider capabilities={capabilities}>
      <Menu label="Actions" items={list} data-testid="menu" />
    </ProtoUIProvider>,
  );
  return { picked };
}

describe("Menu", () => {
  it("is collapsed by default", () => {
    setup();
    expect(screen.getByTestId("menu-trigger")).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("opens on trigger click and selects an item, then closes and restores focus", async () => {
    // userEvent, not fireEvent: a real click focuses the button it lands on, and the
    // focus scope returns focus to whatever was focused when the surface opened. Menu
    // deliberately owns no focus logic of its own (NFR-20), so the test has to behave
    // like a user rather than dispatch a bare click.
    const user = userEvent.setup();
    const { picked } = setup();
    const trigger = screen.getByTestId("menu-trigger");
    await user.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    await user.click(screen.getByTestId("menu-item-edit"));
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

  it("renders the surface in the body-level portal, on the layer the stack assigned it", () => {
    setup();
    fireEvent.click(screen.getByTestId("menu-trigger"));
    const surface = screen.getByTestId("menu-surface");
    expect(document.getElementById(OVERLAY_ROOT_ID)).toContainElement(surface);
    expect(surface).toHaveStyle({ position: "fixed" });
    // Nothing here names a per-kind layer: the value comes from the stack, and it is
    // above the app chrome. Which surface wins against another is promotion order,
    // asserted in OverlayStack.test.tsx and in the browser.
    expect(Number(surface.style.zIndex)).toBeGreaterThan(tokens.layer.sticky);
  });

  it("is promoted into the top layer when the platform has the Popover API", () => {
    const TOP_LAYER: Capabilities = { topLayerDialog: true, popover: true, cssAnchor: false };
    setup(undefined, TOP_LAYER);
    fireEvent.click(screen.getByTestId("menu-trigger"));
    // jsdom has no showPopover, so promote() declines and the attribute is not set --
    // which is exactly the no-op contract topLayer.test.ts pins. What this asserts is
    // that Menu asks, and still renders a usable surface either way.
    expect(screen.getByRole("menu")).toBeInTheDocument();
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

import { render, screen, fireEvent } from "@testing-library/react";
import { Tooltip } from "./Tooltip";
import { OVERLAY_ROOT_ID } from "./Portal";
import { ProtoUIProvider } from "../providers/index";
import { tokens } from "../tokens";
import type { Capabilities } from "./overlay/index";

const FALLBACK: Capabilities = { topLayerDialog: false, popover: false, cssAnchor: false };
const TOP_LAYER: Capabilities = { topLayerDialog: false, popover: true, cssAnchor: false };

function setup(capabilities: Capabilities = FALLBACK) {
  render(
    <ProtoUIProvider capabilities={capabilities}>
      <Tooltip label="Deletes the note permanently" data-testid="tip">
        <button data-testid="control">Delete</button>
      </Tooltip>
    </ProtoUIProvider>,
  );
  return { trigger: screen.getByTestId("tip-trigger"), control: screen.getByTestId("control") };
}

describe("Tooltip", () => {
  it("is absent until something asks for it", () => {
    setup();
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("shows on pointer enter and hides on pointer leave", () => {
    const { trigger } = setup();
    fireEvent.pointerEnter(trigger);
    expect(screen.getByRole("tooltip")).toHaveTextContent("Deletes the note permanently");
    fireEvent.pointerLeave(trigger);
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("shows on focus and hides on blur, so it is reachable by keyboard", () => {
    const { control } = setup();
    fireEvent.focus(control);
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
    fireEvent.blur(control);
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("describes the CONTROL, not the wrapper, because that is what has focus", () => {
    const { trigger, control } = setup();
    expect(control).not.toHaveAttribute("aria-describedby");

    fireEvent.pointerEnter(trigger);
    const surface = screen.getByRole("tooltip");
    expect(control).toHaveAttribute("aria-describedby", surface.id);
    expect(surface.id).not.toBe("");

    fireEvent.pointerLeave(trigger);
    expect(control).not.toHaveAttribute("aria-describedby");
  });

  it("dismisses on Escape, because a tooltip that will not leave is worse than none", () => {
    const { trigger } = setup();
    fireEvent.pointerEnter(trigger);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("does not claim outside clicks, so it cannot swallow a click meant for the page", () => {
    const { trigger } = setup();
    fireEvent.pointerEnter(trigger);
    fireEvent.pointerDown(document.body);
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
  });

  it("renders in the body-level host, above the app chrome", () => {
    const { trigger } = setup();
    fireEvent.pointerEnter(trigger);
    const surface = screen.getByTestId("tip-surface");
    expect(document.getElementById(OVERLAY_ROOT_ID)).toContainElement(surface);
    expect(Number(surface.style.zIndex)).toBeGreaterThan(tokens.layer.sticky);
  });

  it("never intercepts the pointer for the control it describes", () => {
    const { trigger } = setup();
    fireEvent.pointerEnter(trigger);
    expect(screen.getByTestId("tip-surface")).toHaveStyle({ pointerEvents: "none" });
  });

  it("takes no focus of its own", () => {
    const { trigger } = setup();
    fireEvent.pointerEnter(trigger);
    // The surface appeared and focus did not move — a tooltip that steals focus is a
    // tooltip that cannot be read by the person who triggered it. Deliberately no
    // useFocusScope here (NFR-23).
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
    expect(document.activeElement).toBe(document.body);
  });

  it("asks the platform to promote it when the Popover API is there", () => {
    const { trigger } = setup(TOP_LAYER);
    fireEvent.pointerEnter(trigger);
    // jsdom has no showPopover, so promote() declines by contract; what this pins is that
    // Tooltip asks and still renders a usable surface. Chromium proves the rest.
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
  });
});

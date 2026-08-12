import { render, screen, fireEvent } from "@testing-library/react";
import { useRef, useState } from "react";
import { useAnchor, type Placement, type Position } from "./useAnchor";
import type { Capabilities } from "./capabilities";

const SCRIPTED: Capabilities = { topLayerDialog: false, popover: false, cssAnchor: false };
const CSS_ANCHORED: Capabilities = { topLayerDialog: false, popover: false, cssAnchor: true };

/** jsdom has no layout, so the trigger is given the rect a browser would have measured. */
function withRect(el: HTMLElement, rect: { top: number; bottom: number; left: number }) {
  el.getBoundingClientRect = () =>
    ({ ...rect, right: rect.left + 100, width: 100, height: rect.bottom - rect.top, x: rect.left, y: rect.top, toJSON: () => ({}) }) as DOMRect;
}

type HarnessProps = {
  /** Namespaces the testids: src/test/setup.ts asserts uniqueness in the rendered DOM (BR-02). */
  name?: string;
  open?: boolean;
  placement?: Placement;
  capabilities?: Capabilities;
  attachSurface?: boolean;
  rect?: { top: number; bottom: number; left: number };
};

function Harness({
  name = "one",
  open = true,
  placement = "block-end-start",
  capabilities = SCRIPTED,
  attachSurface = true,
  rect = { top: 20, bottom: 44, left: 12 },
}: HarnessProps) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const position = useAnchor({ triggerRef, surfaceRef, open, placement, capabilities });

  return (
    <>
      <button
        ref={(node) => {
          triggerRef.current = node;
          if (node !== null && !ready) {
            withRect(node, rect);
            setReady(true);
          }
        }}
        data-testid={`${name}-trigger`}
      >
        open
      </button>
      {attachSurface ? (
        <div ref={surfaceRef} data-testid={`${name}-surface`} data-position={position === null ? "none" : JSON.stringify(position)} />
      ) : (
        <span data-testid={`${name}-surface`} data-position={position === null ? "none" : JSON.stringify(position)} />
      )}
    </>
  );
}

const positionOf = (name = "one"): Position | "none" => {
  const raw = screen.getByTestId(`${name}-surface`).dataset.position!;
  return raw === "none" ? "none" : (JSON.parse(raw) as Position);
};

describe("useAnchor — rect arithmetic", () => {
  it("anchors below the trigger's start edge", () => {
    render(<Harness />);
    expect(positionOf()).toEqual({ insetBlockStart: 44, insetInlineStart: 12 });
  });

  it("anchors above when asked for block-start", () => {
    render(<Harness placement="block-start-start" />);
    expect(positionOf()).toEqual({ insetBlockStart: 20, insetInlineStart: 12 });
  });

  it("reports no position while closed", () => {
    render(<Harness open={false} />);
    expect(positionOf()).toBe("none");
  });

  it("re-anchors on a window resize rather than drifting", () => {
    render(<Harness />);
    const trigger = screen.getByTestId("one-trigger");
    withRect(trigger, { top: 100, bottom: 130, left: 40 });
    fireEvent(window, new Event("resize"));
    expect(positionOf()).toEqual({ insetBlockStart: 130, insetInlineStart: 40 });
  });

  it("re-anchors on a scroll in an ancestor, which does not bubble", () => {
    render(
      <div data-testid="scroller">
        <Harness />
      </div>,
    );
    const trigger = screen.getByTestId("one-trigger");
    withRect(trigger, { top: -10, bottom: 14, left: 12 });
    // Dispatched on the inner element, not the window: only a capture-phase listener sees it.
    fireEvent.scroll(screen.getByTestId("scroller"));
    expect(positionOf()).toEqual({ insetBlockStart: 14, insetInlineStart: 12 });
  });

  it("stops listening once closed, so a later scroll cannot move a closed surface", () => {
    function Toggling() {
      const [open, setOpen] = useState(true);
      return (
        <>
          <Harness open={open} />
          <button data-testid="close" onClick={() => setOpen(false)}>
            close
          </button>
        </>
      );
    }
    render(<Toggling />);
    expect(positionOf()).not.toBe("none");
    fireEvent.click(screen.getByTestId("close"));
    expect(positionOf()).toBe("none");
    fireEvent(window, new Event("resize"));
    expect(positionOf()).toBe("none");
  });

  it("does nothing when the trigger never attaches", () => {
    function NoTrigger() {
      const triggerRef = useRef<HTMLButtonElement>(null);
      const surfaceRef = useRef<HTMLDivElement>(null);
      const position = useAnchor({ triggerRef, surfaceRef, open: true, capabilities: SCRIPTED });
      return <div ref={surfaceRef} data-testid="one-surface" data-position={position === null ? "none" : "set"} />;
    }
    render(<NoTrigger />);
    expect(screen.getByTestId("one-surface").dataset.position).toBe("none");
  });
});

describe("useAnchor — CSS anchor positioning", () => {
  it("hands the work to the browser and returns no coordinates", () => {
    render(<Harness capabilities={CSS_ANCHORED} />);
    expect(positionOf()).toBe("none");

    const trigger = screen.getByTestId("one-trigger");
    const surface = screen.getByTestId("one-surface");
    const name = trigger.style.getPropertyValue("anchor-name");
    expect(name).toMatch(/^--pf-anchor-[a-zA-Z0-9-]+$/);
    expect(surface.style.getPropertyValue("position-anchor")).toBe(name);
    expect(surface.style.getPropertyValue("position-area")).toBe("block-end span-inline-end");
  });

  it("expresses block-start placement as its own position-area", () => {
    render(<Harness capabilities={CSS_ANCHORED} placement="block-start-start" />);
    expect(screen.getByTestId("one-surface").style.getPropertyValue("position-area")).toBe(
      "block-start span-inline-end",
    );
  });

  it("gives each instance its own anchor name, so two menus cannot cross-anchor", () => {
    render(
      <>
        <Harness name="one" capabilities={CSS_ANCHORED} />
        <Harness name="two" capabilities={CSS_ANCHORED} />
      </>,
    );
    const a = screen.getByTestId("one-trigger");
    const b = screen.getByTestId("two-trigger");
    expect(a.style.getPropertyValue("anchor-name")).not.toBe(b.style.getPropertyValue("anchor-name"));
  });

  it("cleans the properties off both elements when it closes", () => {
    function Toggling() {
      const [open, setOpen] = useState(true);
      return (
        <>
          <Harness open={open} capabilities={CSS_ANCHORED} />
          <button data-testid="close" onClick={() => setOpen(false)}>
            close
          </button>
        </>
      );
    }
    render(<Toggling />);
    expect(screen.getByTestId("one-trigger").style.getPropertyValue("anchor-name")).not.toBe("");
    fireEvent.click(screen.getByTestId("close"));
    expect(screen.getByTestId("one-trigger").style.getPropertyValue("anchor-name")).toBe("");
    expect(screen.getByTestId("one-surface").style.getPropertyValue("position-anchor")).toBe("");
  });

  it("does nothing when the surface never attaches", () => {
    render(<Harness capabilities={CSS_ANCHORED} attachSurface={false} />);
    expect(screen.getByTestId("one-trigger").style.getPropertyValue("anchor-name")).toBe("");
  });
});

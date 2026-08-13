import { render, screen, fireEvent } from "@testing-library/react";
import { useRef, useState } from "react";
import { usePromotion } from "./usePromotion";
import type { Capabilities } from "./capabilities";

// The element carries the Popover API the way topLayer.test.ts builds it: real jsdom
// element, only the methods jsdom lacks supplied, with :popover-open answered honestly.
const CAPABLE: Capabilities = { topLayerDialog: false, popover: true, cssAnchor: false };
const INCAPABLE: Capabilities = { topLayerDialog: false, popover: false, cssAnchor: false };

function Surface({ open, capabilities, calls }: { open: boolean; capabilities: Capabilities; calls: string[] }) {
  const ref = useRef<HTMLDivElement>(null);
  usePromotion({ ref, open, capabilities });
  return (
    <div
      data-testid="surface"
      ref={(node) => {
        ref.current = node;
        if (node !== null && !("showPopover" in node)) {
          Object.defineProperties(node, {
            showPopover: { value: () => calls.push("show"), configurable: true },
            hidePopover: { value: () => calls.push("hide"), configurable: true },
          });
        }
      }}
    />
  );
}

describe("usePromotion", () => {
  it("promotes on open and demotes on close — always as a pair", () => {
    const calls: string[] = [];
    function Toggling() {
      const [open, setOpen] = useState(true);
      return (
        <>
          <Surface open={open} capabilities={CAPABLE} calls={calls} />
          <button data-testid="toggle" onClick={() => setOpen((v) => !v)}>
            toggle
          </button>
        </>
      );
    }
    render(<Toggling />);
    expect(calls).toEqual(["show"]);
    fireEvent.click(screen.getByTestId("toggle"));
    expect(calls).toEqual(["show", "hide"]);
    fireEvent.click(screen.getByTestId("toggle"));
    expect(calls).toEqual(["show", "hide", "show"]);
  });

  it("demotes on unmount, so a surface cannot leak into the top layer after close", () => {
    const calls: string[] = [];
    const { unmount } = render(<Surface open capabilities={CAPABLE} calls={calls} />);
    expect(calls).toEqual(["show"]);
    unmount();
    expect(calls).toEqual(["show", "hide"]);
  });

  it("does nothing while closed", () => {
    const calls: string[] = [];
    render(<Surface open={false} capabilities={CAPABLE} calls={calls} />);
    expect(calls).toEqual([]);
  });

  it("does nothing without the capability — the fallback path owns layering then", () => {
    const calls: string[] = [];
    render(<Surface open capabilities={INCAPABLE} calls={calls} />);
    expect(calls).toEqual([]);
  });

  it("re-promotes when the resignal changes while open — new content, new claim to the top", () => {
    const calls: string[] = [];
    function Resignalling() {
      const ref = useRef<HTMLDivElement>(null);
      const [signal, setSignal] = useState("t1");
      usePromotion({ ref, open: true, capabilities: CAPABLE, resignal: signal });
      return (
        <>
          <div
            data-testid="surface"
            ref={(node) => {
              ref.current = node;
              if (node !== null && !("showPopover" in node)) {
                Object.defineProperties(node, {
                  showPopover: { value: () => calls.push("show"), configurable: true },
                  hidePopover: { value: () => calls.push("hide"), configurable: true },
                });
              }
            }}
          />
          <button data-testid="raise" onClick={() => setSignal("t2")}>
            raise another
          </button>
        </>
      );
    }
    render(<Resignalling />);
    expect(calls).toEqual(["show"]);
    // A second toast in an already-showing region: demote + promote re-enters the top
    // layer ON TOP, which is what puts it above a dialog opened between the two.
    fireEvent.click(screen.getByTestId("raise"));
    expect(calls).toEqual(["show", "hide", "show"]);
  });

  it("does nothing when the ref never attaches", () => {
    function Headless() {
      const ref = useRef<HTMLDivElement>(null);
      usePromotion({ ref, open: true, capabilities: CAPABLE });
      return null;
    }
    expect(() => render(<Headless />)).not.toThrow();
  });
});

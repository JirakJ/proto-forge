import { render, screen, fireEvent } from "@testing-library/react";
import { useState } from "react";
import { OverlayStackProvider, useOverlaySlot, STEP, type OverlaySlot } from "./OverlayStack";
import { tokens } from "../../tokens";
import { OVERLAY_KINDS, type OverlayKind } from "./types";

// The slot is read through the DOM rather than by inspecting the hook, so every
// assertion here is about behaviour a component could actually observe.
function Probe({ name, kind, open }: { name: string; kind: OverlayKind; open: boolean }) {
  const slot = useOverlaySlot(kind, open);
  return (
    <span
      data-testid={name}
      data-ordinal={slot.ordinal}
      data-topmost={slot.isTopmost}
      data-depth={slot.depth}
      data-z={slot.fallbackZIndex}
    />
  );
}

const slotOf = (name: string) => {
  const el = screen.getByTestId(name);
  return {
    ordinal: Number(el.dataset.ordinal),
    topmost: el.dataset.topmost === "true",
    depth: Number(el.dataset.depth),
    z: Number(el.dataset.z),
  };
};

describe("useOverlaySlot", () => {
  it("throws outside a provider, naming the provider it needs", () => {
    // React logs the error it re-throws; the assertion is on the message a developer reads.
    expect(() => render(<Probe name="a" kind="modal" open />)).toThrow(/OverlayStackProvider/);
  });

  it("gives a single open surface ordinal 0 and makes it topmost", () => {
    render(
      <OverlayStackProvider>
        <Probe name="a" kind="modal" open />
      </OverlayStackProvider>,
    );
    expect(slotOf("a")).toMatchObject({ ordinal: 0, topmost: true, depth: 1 });
  });

  it("reports a closed surface as ordinal -1, not topmost, and off the scale", () => {
    render(
      <OverlayStackProvider>
        <Probe name="a" kind="modal" open={false} />
      </OverlayStackProvider>,
    );
    expect(slotOf("a")).toMatchObject({ ordinal: -1, topmost: false, depth: 0, z: tokens.layer.base });
  });

  it("orders by when a surface opened, and moves topmost to the newest", () => {
    function Two() {
      const [secondOpen, setSecondOpen] = useState(false);
      return (
        <OverlayStackProvider>
          <Probe name="a" kind="modal" open />
          <Probe name="b" kind="modal" open={secondOpen} />
          <button data-testid="open-b" onClick={() => setSecondOpen(true)}>
            open
          </button>
          <button data-testid="close-b" onClick={() => setSecondOpen(false)}>
            close
          </button>
        </OverlayStackProvider>
      );
    }
    render(<Two />);
    expect(slotOf("a").topmost).toBe(true);

    fireEvent.click(screen.getByTestId("open-b"));
    expect(slotOf("a")).toMatchObject({ ordinal: 0, topmost: false, depth: 2 });
    expect(slotOf("b")).toMatchObject({ ordinal: 1, topmost: true, depth: 2 });

    // Closing the newer surface returns topmost to the one underneath — the property
    // Escape-dismisses-the-topmost depends on.
    fireEvent.click(screen.getByTestId("close-b"));
    expect(slotOf("a")).toMatchObject({ ordinal: 0, topmost: true, depth: 1 });
    expect(slotOf("b").ordinal).toBe(-1);
  });

  it("puts a popover opened inside a modal above it, and a LATER modal above the popover", () => {
    // This is the defect a per-kind scale cannot express: with popover ranked above
    // modal by kind, the menu below would outrank dialog B forever.
    function Nested() {
      const [bOpen, setBOpen] = useState(false);
      return (
        <OverlayStackProvider>
          <Probe name="dialog-a" kind="modal" open />
          <Probe name="menu-in-a" kind="popover" open />
          <Probe name="dialog-b" kind="modal" open={bOpen} />
          <button data-testid="open-b" onClick={() => setBOpen(true)}>
            open
          </button>
        </OverlayStackProvider>
      );
    }
    render(<Nested />);
    expect(slotOf("menu-in-a").z).toBeGreaterThan(slotOf("dialog-a").z);

    fireEvent.click(screen.getByTestId("open-b"));
    expect(slotOf("dialog-b").z).toBeGreaterThan(slotOf("menu-in-a").z);
    expect(slotOf("dialog-b").topmost).toBe(true);
    expect(slotOf("menu-in-a").topmost).toBe(false);
  });

  it("spaces the fallback scale by STEP from one base, leaving room for a scrim under each surface", () => {
    render(
      <OverlayStackProvider>
        <Probe name="a" kind="modal" open />
        <Probe name="b" kind="popover" open />
      </OverlayStackProvider>,
    );
    expect(slotOf("a").z).toBe(tokens.layer.overlay);
    expect(slotOf("b").z).toBe(tokens.layer.overlay + STEP);
    expect(STEP).toBeGreaterThan(1);
  });

  it("does not care about kind when ordering — two kinds interleave by open order", () => {
    render(
      <OverlayStackProvider>
        <Probe name="toast" kind="toast" open />
        <Probe name="dialog" kind="modal" open />
      </OverlayStackProvider>,
    );
    // The toast mounted first, so the dialog is above it. A toast that must outrank a
    // modal is one raised AFTER the modal opened, which is the case that matters.
    expect(slotOf("dialog").z).toBeGreaterThan(slotOf("toast").z);
  });

  it("keeps two provider trees independent", () => {
    render(
      <>
        <OverlayStackProvider>
          <Probe name="one-a" kind="modal" open />
        </OverlayStackProvider>
        <OverlayStackProvider>
          <Probe name="two-a" kind="modal" open />
        </OverlayStackProvider>
      </>,
    );
    expect(slotOf("one-a")).toMatchObject({ ordinal: 0, depth: 1 });
    expect(slotOf("two-a")).toMatchObject({ ordinal: 0, depth: 1 });
  });

  it("registers each surface once, however often the tree re-renders", () => {
    function Rerendering() {
      const [n, setN] = useState(0);
      return (
        <OverlayStackProvider>
          <Probe name="a" kind="modal" open />
          <button data-testid="bump" onClick={() => setN(n + 1)}>
            {n}
          </button>
        </OverlayStackProvider>
      );
    }
    render(<Rerendering />);
    fireEvent.click(screen.getByTestId("bump"));
    fireEvent.click(screen.getByTestId("bump"));
    expect(slotOf("a").depth).toBe(1);
  });

  it("re-registers exactly once when a surface changes kind while open", () => {
    // This is the invariant that lets register() skip a duplicate-id guard: the
    // effect always unregisters before it registers again.
    function Switching() {
      const [kind, setKind] = useState<OverlayKind>("modal");
      return (
        <OverlayStackProvider>
          <Probe name="a" kind={kind} open />
          <button data-testid="to-popover" onClick={() => setKind("popover")}>
            switch
          </button>
        </OverlayStackProvider>
      );
    }
    render(<Switching />);
    expect(slotOf("a").depth).toBe(1);
    fireEvent.click(screen.getByTestId("to-popover"));
    expect(slotOf("a")).toMatchObject({ ordinal: 0, depth: 1, topmost: true });
  });

  it("enumerates every kind as a value, so a gate can check none is untested", () => {
    expect([...OVERLAY_KINDS]).toEqual(["modal", "popover", "toast", "tooltip"]);
  });

  it("uses the capabilities it is given rather than detecting them", () => {
    function CapsProbe() {
      const slot: OverlaySlot = useOverlaySlot("modal", true);
      return <span data-testid="caps" data-top-layer={slot.capabilities.topLayerDialog} />;
    }
    render(
      <OverlayStackProvider capabilities={{ topLayerDialog: true, popover: true, cssAnchor: true }}>
        <CapsProbe />
      </OverlayStackProvider>,
    );
    expect(screen.getByTestId("caps").dataset.topLayer).toBe("true");
  });

  it("detects capabilities from the live view when none are pinned", () => {
    function CapsProbe() {
      const slot = useOverlaySlot("modal", true);
      return <span data-testid="caps" data-top-layer={slot.capabilities.topLayerDialog} />;
    }
    render(
      <OverlayStackProvider>
        <CapsProbe />
      </OverlayStackProvider>,
    );
    // jsdom implements no top-layer API, so the live detection reports false here.
    expect(screen.getByTestId("caps").dataset.topLayer).toBe("false");
  });
});

import { render, screen, fireEvent } from "@testing-library/react";
import { useRef, useState, type ReactNode } from "react";
import { OverlayStackProvider, useOverlaySlot } from "./OverlayStack";
import { useDismiss } from "./useDismiss";
import type { OverlayKind } from "./types";

type SurfaceProps = {
  name: string;
  kind?: OverlayKind;
  open?: boolean;
  onDismiss: () => void;
  escape?: boolean;
  outsidePointer?: boolean;
  children?: ReactNode;
};

// Defaults mirror useDismiss's own, so the props are always booleans: tsconfig sets
// exactOptionalPropertyTypes, which rightly refuses an explicit `undefined` for an
// optional property.
function Surface({
  name,
  kind = "modal",
  open = true,
  onDismiss,
  escape = true,
  outsidePointer = true,
  children,
}: SurfaceProps) {
  const ref = useRef<HTMLDivElement>(null);
  const slot = useOverlaySlot(kind, open);
  useDismiss({ ref, slot, onDismiss, enabled: open, escape, outsidePointer });
  return open ? (
    <div ref={ref} data-testid={name}>
      {children}
    </div>
  ) : null;
}

const escapeKey = () => fireEvent.keyDown(document, { key: "Escape" });

describe("useDismiss", () => {
  it("dismisses on Escape", () => {
    const calls: string[] = [];
    render(
      <OverlayStackProvider>
        <Surface name="a" onDismiss={() => calls.push("a")} />
      </OverlayStackProvider>,
    );
    escapeKey();
    expect(calls).toEqual(["a"]);
  });

  it("ignores keys that are not Escape", () => {
    const calls: string[] = [];
    render(
      <OverlayStackProvider>
        <Surface name="a" onDismiss={() => calls.push("a")} />
      </OverlayStackProvider>,
    );
    fireEvent.keyDown(document, { key: "a" });
    fireEvent.keyDown(document, { key: "Enter" });
    expect(calls).toEqual([]);
  });

  it("dismisses ONLY the topmost surface — the defect that closed a menu and its dialog together", () => {
    const calls: string[] = [];
    render(
      <OverlayStackProvider>
        <Surface name="dialog" onDismiss={() => calls.push("dialog")} />
        <Surface name="menu" kind="popover" onDismiss={() => calls.push("menu")} />
      </OverlayStackProvider>,
    );
    escapeKey();
    expect(calls).toEqual(["menu"]);

    // And once the menu is gone, the next Escape reaches the dialog.
    calls.length = 0;
  });

  it("hands Escape back to the surface underneath after the top one closes", () => {
    const calls: string[] = [];
    function Stack() {
      const [menuOpen, setMenuOpen] = useState(true);
      return (
        <OverlayStackProvider>
          <Surface name="dialog" onDismiss={() => calls.push("dialog")} />
          <Surface
            name="menu"
            kind="popover"
            open={menuOpen}
            onDismiss={() => {
              calls.push("menu");
              setMenuOpen(false);
            }}
          />
        </OverlayStackProvider>
      );
    }
    render(<Stack />);
    escapeKey();
    escapeKey();
    expect(calls).toEqual(["menu", "dialog"]);
  });

  it("dismisses on a pointer outside the surface, not inside it", () => {
    const calls: string[] = [];
    render(
      <OverlayStackProvider>
        <div data-testid="outside">elsewhere</div>
        <Surface name="a" onDismiss={() => calls.push("a")}>
          <button data-testid="inside">inside</button>
        </Surface>
      </OverlayStackProvider>,
    );
    fireEvent.pointerDown(screen.getByTestId("inside"));
    expect(calls).toEqual([]);
    fireEvent.pointerDown(screen.getByTestId("outside"));
    expect(calls).toEqual(["a"]);
  });

  it("honours escape: false while keeping outside-pointer dismissal", () => {
    const calls: string[] = [];
    render(
      <OverlayStackProvider>
        <div data-testid="outside">elsewhere</div>
        <Surface name="a" escape={false} onDismiss={() => calls.push("a")} />
      </OverlayStackProvider>,
    );
    escapeKey();
    expect(calls).toEqual([]);
    fireEvent.pointerDown(screen.getByTestId("outside"));
    expect(calls).toEqual(["a"]);
  });

  it("honours outsidePointer: false while keeping Escape", () => {
    const calls: string[] = [];
    render(
      <OverlayStackProvider>
        <div data-testid="outside">elsewhere</div>
        <Surface name="a" outsidePointer={false} onDismiss={() => calls.push("a")} />
      </OverlayStackProvider>,
    );
    fireEvent.pointerDown(screen.getByTestId("outside"));
    expect(calls).toEqual([]);
    escapeKey();
    expect(calls).toEqual(["a"]);
  });

  it("registers nothing while disabled", () => {
    const calls: string[] = [];
    render(
      <OverlayStackProvider>
        <Surface name="a" open={false} onDismiss={() => calls.push("a")} />
      </OverlayStackProvider>,
    );
    escapeKey();
    fireEvent.pointerDown(document.body);
    expect(calls).toEqual([]);
  });

  it("calls the latest handler after a re-render, not the one captured at mount", () => {
    const calls: string[] = [];
    function Renaming() {
      const [label, setLabel] = useState("first");
      return (
        <OverlayStackProvider>
          <Surface name="a" onDismiss={() => calls.push(label)} />
          <button data-testid="rename" onClick={() => setLabel("second")}>
            rename
          </button>
        </OverlayStackProvider>
      );
    }
    render(<Renaming />);
    fireEvent.click(screen.getByTestId("rename"));
    escapeKey();
    expect(calls).toEqual(["second"]);
  });

  it("installs exactly one keydown listener however many surfaces are open", () => {
    const added = new Map<string, number>();
    const spy = vi.spyOn(document, "addEventListener").mockImplementation(((
      type: string,
      ...rest: unknown[]
    ) => {
      added.set(type, (added.get(type) ?? 0) + 1);
      return Reflect.apply(
        EventTarget.prototype.addEventListener,
        document,
        [type, ...rest] as Parameters<typeof document.addEventListener>,
      );
    }) as typeof document.addEventListener);

    try {
      render(
        <OverlayStackProvider>
          <Surface name="a" onDismiss={() => {}} />
          <Surface name="b" kind="popover" onDismiss={() => {}} />
          <Surface name="c" kind="toast" onDismiss={() => {}} />
        </OverlayStackProvider>,
      );
      expect(added.get("keydown")).toBe(1);
      expect(added.get("pointerdown")).toBe(1);
    } finally {
      spy.mockRestore();
    }
  });

  it("removes its listeners once the last surface closes, and re-installs for the next", () => {
    const removed: string[] = [];
    const spy = vi.spyOn(document, "removeEventListener");
    function Toggling() {
      const [open, setOpen] = useState(true);
      return (
        <OverlayStackProvider>
          <Surface name="a" open={open} onDismiss={() => {}} />
          <button data-testid="toggle" onClick={() => setOpen((v) => !v)}>
            toggle
          </button>
        </OverlayStackProvider>
      );
    }
    try {
      render(<Toggling />);
      fireEvent.click(screen.getByTestId("toggle"));
      for (const call of spy.mock.calls) removed.push(String(call[0]));
      expect(removed).toContain("keydown");
      expect(removed).toContain("pointerdown");

      // Re-opening installs again: the "listening" flag has to be reset, not latched.
      const calls: string[] = [];
      spy.mockRestore();
      fireEvent.click(screen.getByTestId("toggle"));
      expect(calls).toEqual([]);
      escapeKey();
    } finally {
      spy.mockRestore();
    }
  });

  it("does not dismiss when the topmost surface has no element yet", () => {
    const calls: string[] = [];
    function Headless({ onDismiss }: { onDismiss: () => void }) {
      const ref = useRef<HTMLDivElement>(null);
      const slot = useOverlaySlot("toast", true);
      useDismiss({ ref, slot, onDismiss, enabled: true });
      return null; // ref never attaches
    }
    render(
      <OverlayStackProvider>
        <div data-testid="outside">elsewhere</div>
        <Headless onDismiss={() => calls.push("headless")} />
      </OverlayStackProvider>,
    );
    fireEvent.pointerDown(screen.getByTestId("outside"));
    expect(calls).toEqual([]);
  });
});

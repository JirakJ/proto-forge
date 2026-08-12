import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { Dialog, type DialogProps } from "./Dialog";
import { OVERLAY_ROOT_ID } from "./Portal";
import { ProtoUIProvider } from "../providers/index";
import type { Capabilities } from "./overlay/index";
import { tokens } from "../tokens";

// Two paths, exercised deliberately rather than by whatever the environment implements.
// jsdom has no showModal at all, so without pinning capabilities the top-layer branch
// would never run here — and it is the primary one.
const FALLBACK: Capabilities = { topLayerDialog: false, popover: false, cssAnchor: false };
const TOP_LAYER: Capabilities = { topLayerDialog: false, popover: true, cssAnchor: false };

/** An app root, so the inert bookkeeping has something real to mark. */
function withAppRoot() {
  const root = document.createElement("div");
  root.id = "root";
  document.body.append(root);
  return root;
}

function renderDialog(capabilities: Capabilities, props: Partial<DialogProps> = {}) {
  const onClose = props.onClose ?? (() => {});
  return render(
    <ProtoUIProvider capabilities={capabilities}>
      <Dialog open title="Confirm" data-testid="dlg" onClose={onClose} {...props}>
        <p data-testid="dlg-body">Body</p>
      </Dialog>
    </ProtoUIProvider>,
  );
}

afterEach(() => {
  document.getElementById("root")?.remove();
});

describe("Dialog — the contract both paths share", () => {
  it.each([
    ["fallback", FALLBACK],
    ["top layer", TOP_LAYER],
  ])("renders nothing when closed (%s)", (_name, capabilities) => {
    render(
      <ProtoUIProvider capabilities={capabilities}>
        <Dialog open={false} title="Confirm" data-testid="dlg" onClose={() => {}}>
          <p>Body</p>
        </Dialog>
      </ProtoUIProvider>,
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it.each([
    ["fallback", FALLBACK],
    ["top layer", TOP_LAYER],
  ])("renders an accessible modal named by its title (%s)", (_name, capabilities) => {
    renderDialog(capabilities);
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAttribute("aria-label", "Confirm");
    expect(dialog).toHaveTextContent("Body");
    expect(dialog).toHaveAttribute("data-pf-modal");
  });

  it.each([
    ["fallback", FALLBACK],
    ["top layer", TOP_LAYER],
  ])("escapes the app tree into the body-level host (%s)", (_name, capabilities) => {
    renderDialog(capabilities);
    const host = document.getElementById(OVERLAY_ROOT_ID)!;
    expect(host).toContainElement(screen.getByTestId("dlg"));
    expect(host.parentElement).toBe(document.body);
  });

  it.each([
    ["fallback", FALLBACK],
    ["top layer", TOP_LAYER],
  ])("focuses the surface on open and holds the page still (%s)", (_name, capabilities) => {
    const { unmount } = renderDialog(capabilities);
    expect(document.activeElement).toBe(screen.getByTestId("dlg"));
    expect(document.documentElement.style.overflow).toBe("hidden");
    unmount();
    expect(document.documentElement.style.overflow).toBe("");
  });

  it.each([
    ["fallback", FALLBACK],
    ["top layer", TOP_LAYER],
  ])("titles itself with a heading carrying its own testid (%s)", (_name, capabilities) => {
    renderDialog(capabilities);
    expect(screen.getByTestId("dlg-title")).toHaveTextContent("Confirm");
  });
});

describe("Dialog — the top-layer path", () => {
  it("paints no scrim of its own: ::backdrop is the browser's", () => {
    renderDialog(TOP_LAYER);
    expect(screen.queryByTestId("dlg-scrim")).toBeNull();
  });

  it("still owns focus containment, inertness and Escape", () => {
    // showModal() would have supplied the first two natively, and was rejected for it:
    // its inertness also killed every surface promoted above the modal. So the library
    // owns them on BOTH paths, and this asserts the platform path is not a special case.
    const root = withAppRoot();
    let closed = 0;
    render(
      <ProtoUIProvider capabilities={TOP_LAYER}>
        <Dialog open title="Confirm" data-testid="dlg" onClose={() => (closed += 1)}>
          <button data-testid="one">One</button>
          <button data-testid="two">Two</button>
        </Dialog>
      </ProtoUIProvider>,
    );
    expect(root.hasAttribute("inert")).toBe(true);

    const two = screen.getByTestId("two");
    two.focus();
    fireEvent.keyDown(two, { key: "Tab" });
    expect(document.activeElement).toBe(screen.getByTestId("one"));

    fireEvent.keyDown(document, { key: "Escape" });
    expect(closed).toBe(1);
  });
});

describe("Dialog — the fallback path", () => {
  it("draws its own scrim above the app chrome and below its surface", () => {
    renderDialog(FALLBACK);
    const scrim = screen.getByTestId("dlg-scrim");
    const surface = screen.getByTestId("dlg");
    expect(scrim).toHaveStyle({ position: "fixed" });
    const scrimZ = Number(scrim.style.zIndex);
    expect(scrimZ).toBeGreaterThan(tokens.layer.sticky);
    expect(Number(surface.style.zIndex)).toBeGreaterThan(scrimZ);
  });

  it("closes on a scrim click but not on a click in its own content", async () => {
    const user = userEvent.setup();
    let closed = 0;
    renderDialog(FALLBACK, { onClose: () => (closed += 1) });
    await user.click(screen.getByTestId("dlg-body"));
    expect(closed).toBe(0);
    await user.click(screen.getByTestId("dlg-scrim"));
    expect(closed).toBe(1);
  });

  it("closes on Escape, because nothing native will", () => {
    let closed = 0;
    renderDialog(FALLBACK, { onClose: () => (closed += 1) });
    fireEvent.keyDown(document, { key: "a" });
    expect(closed).toBe(0);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(closed).toBe(1);
  });

  it("inerts the app root, and never the overlay host above it", () => {
    const root = withAppRoot();
    const { unmount } = renderDialog(FALLBACK);
    expect(root.hasAttribute("inert")).toBe(true);
    unmount();
    expect(root.hasAttribute("inert")).toBe(false);
  });

  it("traps Tab within the dialog", () => {
    render(
      <ProtoUIProvider capabilities={FALLBACK}>
        <Dialog open title="Confirm" data-testid="dlg" onClose={() => {}}>
          <button data-testid="one">One</button>
          <button data-testid="two">Two</button>
        </Dialog>
      </ProtoUIProvider>,
    );
    const surface = screen.getByTestId("dlg");
    const one = screen.getByTestId("one");
    const two = screen.getByTestId("two");

    two.focus();
    fireEvent.keyDown(two, { key: "Tab" });
    expect(document.activeElement).toBe(one);

    one.focus();
    fireEvent.keyDown(one, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(two);

    surface.focus();
    fireEvent.keyDown(surface, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(two);
  });

  it("carries its own layer from the stack, since the platform assigns none", () => {
    renderDialog(FALLBACK);
    expect(Number(screen.getByTestId("dlg").style.zIndex)).toBeGreaterThan(tokens.layer.sticky);
  });
});

describe("Dialog — lifecycle", () => {
  it("tears its dismissal down when it closes", () => {
    let closed = 0;
    function Closing() {
      const [open, setOpen] = useState(true);
      return (
        <ProtoUIProvider capabilities={FALLBACK}>
          <Dialog open={open} title="Confirm" data-testid="dlg" onClose={() => (closed += 1)}>
            <button data-testid="hide" onClick={() => setOpen(false)}>
              hide
            </button>
          </Dialog>
        </ProtoUIProvider>
      );
    }
    render(<Closing />);
    fireEvent.click(screen.getByTestId("hide"));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(closed).toBe(0);
  });

  it("does not steal focus when the parent re-renders with a new onClose", () => {
    const calls: string[] = [];
    function Renaming() {
      const [label, setLabel] = useState("a");
      return (
        <ProtoUIProvider capabilities={FALLBACK}>
          <Dialog open title="Confirm" data-testid="dlg" onClose={() => calls.push(label)}>
            <button data-testid="inner">x</button>
            <button data-testid="rename" onClick={() => setLabel("b")}>
              rename
            </button>
          </Dialog>
        </ProtoUIProvider>
      );
    }
    render(<Renaming />);
    const inner = screen.getByTestId("inner");
    inner.focus();
    fireEvent.click(screen.getByTestId("rename"));
    // Focus is still where the user put it. If the focus effect keyed on onClose it
    // would have re-run on this render and yanked focus back to the surface, which is
    // the bug this asserts against.
    expect(document.activeElement).toBe(inner);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(calls).toEqual(["b"]);
  });

  it("stacks: the second dialog owns Escape, and closing it returns Escape to the first", () => {
    const calls: string[] = [];
    function Stacked() {
      const [secondOpen, setSecondOpen] = useState(false);
      return (
        <ProtoUIProvider capabilities={FALLBACK}>
          <Dialog open title="First" data-testid="one" onClose={() => calls.push("one")}>
            <button data-testid="open-two" onClick={() => setSecondOpen(true)}>
              open
            </button>
          </Dialog>
          <Dialog
            open={secondOpen}
            title="Second"
            data-testid="two"
            onClose={() => {
              calls.push("two");
              setSecondOpen(false);
            }}
          >
            <p data-testid="two-body">Second body</p>
          </Dialog>
        </ProtoUIProvider>
      );
    }
    render(<Stacked />);
    fireEvent.click(screen.getByTestId("open-two"));

    // The later dialog paints above the earlier one, and owns Escape alone.
    expect(Number(screen.getByTestId("two").style.zIndex)).toBeGreaterThan(
      Number(screen.getByTestId("one").style.zIndex),
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(calls).toEqual(["two"]);

    // The first is still open and still holds the page.
    expect(screen.getByTestId("one")).toBeInTheDocument();
    expect(document.documentElement.style.overflow).toBe("hidden");

    fireEvent.keyDown(document, { key: "Escape" });
    expect(calls).toEqual(["two", "one"]);
  });
});

import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Dialog, type DialogProps } from "./Dialog";
import { OVERLAY_ROOT_ID } from "./Portal";
import { ProtoUIProvider, type ProviderKind } from "../providers/index";
import { tokens } from "../tokens";

function renderDialog(kind: ProviderKind, props: Partial<DialogProps> = {}) {
  const onClose = props.onClose ?? (() => {});
  const utils = render(
    <ProtoUIProvider provider={kind}>
      <Dialog open title="Confirm" data-testid="dlg" onClose={onClose} {...props}>
        <p>Body</p>
      </Dialog>
    </ProtoUIProvider>,
  );
  return { ...utils, onClose };
}

describe("Dialog (own provider)", () => {
  it("renders nothing when closed", () => {
    render(
      <ProtoUIProvider provider="own">
        <Dialog open={false} title="Confirm" data-testid="dlg" onClose={() => {}}>
          <p>Body</p>
        </Dialog>
      </ProtoUIProvider>,
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("renders an accessible modal and focuses it when open", () => {
    renderDialog("own");
    const dlg = screen.getByRole("dialog");
    expect(dlg).toHaveAttribute("aria-modal", "true");
    expect(dlg).toHaveAttribute("aria-label", "Confirm");
    expect(dlg).toHaveTextContent("Body");
    expect(document.activeElement).toBe(dlg);
  });

  it("escapes the app tree: scrim and surface live in the body-level portal, above the app", () => {
    renderDialog("own");
    const host = document.getElementById(OVERLAY_ROOT_ID)!;
    const scrim = screen.getByTestId("dlg-scrim");
    expect(host).toContainElement(scrim);
    expect(host).toContainElement(screen.getByTestId("dlg"));
    expect(scrim).toHaveStyle({ position: "fixed", zIndex: String(tokens.layer.overlay) });
    expect(screen.getByTestId("dlg")).toHaveStyle({ zIndex: String(tokens.layer.modal) });
    expect(tokens.layer.overlay).toBeGreaterThan(tokens.layer.sticky);
  });

  it("closes on Escape, ignores other keys, and (no focusables) keeps Tab inside", () => {
    let closed = 0;
    renderDialog("own", { onClose: () => (closed += 1) });
    fireEvent.keyDown(document, { key: "a" });
    expect(closed).toBe(0);
    fireEvent.keyDown(document, { key: "Tab" }); // no focusable children -> stays on dialog
    expect(document.activeElement).toBe(screen.getByRole("dialog"));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(closed).toBe(1);
  });

  it("closes on scrim click but not on content click", async () => {
    const user = userEvent.setup();
    let closed = 0;
    renderDialog("own", { onClose: () => (closed += 1) });
    await user.click(screen.getByRole("dialog"));
    expect(closed).toBe(0);
    await user.click(screen.getByTestId("dlg-scrim"));
    expect(closed).toBe(1);
  });

  it("tears down its key listener when it closes", () => {
    let closed = 0;
    const { rerender } = render(
      <ProtoUIProvider provider="own">
        <Dialog open title="Confirm" data-testid="dlg" onClose={() => (closed += 1)}>
          <p>Body</p>
        </Dialog>
      </ProtoUIProvider>,
    );
    rerender(
      <ProtoUIProvider provider="own">
        <Dialog open={false} title="Confirm" data-testid="dlg" onClose={() => (closed += 1)}>
          <p>Body</p>
        </Dialog>
      </ProtoUIProvider>,
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(closed).toBe(0);
  });

  it("does not steal focus when the parent re-renders with a new onClose", () => {
    const calls: string[] = [];
    const { rerender } = render(
      <ProtoUIProvider provider="own">
        <Dialog open title="Confirm" data-testid="dlg" onClose={() => calls.push("a")}>
          <button data-testid="inner">x</button>
        </Dialog>
      </ProtoUIProvider>,
    );
    const inner = screen.getByTestId("inner");
    inner.focus();
    expect(document.activeElement).toBe(inner);
    rerender(
      <ProtoUIProvider provider="own">
        <Dialog open title="Confirm" data-testid="dlg" onClose={() => calls.push("b")}>
          <button data-testid="inner">x</button>
        </Dialog>
      </ProtoUIProvider>,
    );
    // Effect keyed on [open] only: no re-run, focus stays where the user put it.
    expect(document.activeElement).toBe(inner);
    // onClose read through a ref: Escape calls the latest handler.
    fireEvent.keyDown(document, { key: "Escape" });
    expect(calls).toEqual(["b"]);
  });

  it("traps Tab focus within the dialog", () => {
    render(
      <ProtoUIProvider provider="own">
        <Dialog open title="Confirm" data-testid="dlg" onClose={() => {}}>
          <button data-testid="one">One</button>
          <button data-testid="two">Two</button>
        </Dialog>
      </ProtoUIProvider>,
    );
    const dlg = screen.getByTestId("dlg");
    const one = screen.getByTestId("one");
    const two = screen.getByTestId("two");

    // Tab at the last focusable wraps to the first.
    two.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(one);

    // Shift+Tab at the first wraps to the last.
    one.focus();
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(two);

    // Tab in the middle (not last) does not wrap.
    one.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(one);

    // Shift+Tab from the dialog container wraps to the last.
    dlg.focus();
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(two);

    // Shift+Tab at the last (neither first nor container) does not wrap.
    two.focus();
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(two);
  });
});

describe("Dialog (radix provider)", () => {
  it("renders content and closes on Escape", async () => {
    const user = userEvent.setup();
    let closed = 0;
    renderDialog("radix", { onClose: () => (closed += 1) });
    expect(screen.getByTestId("dlg")).toHaveTextContent("Body");
    await user.keyboard("{Escape}");
    expect(closed).toBeGreaterThan(0);
  });

  it("carries the same layering contract as the own provider", () => {
    renderDialog("radix");
    expect(screen.getByTestId("dlg-scrim")).toHaveStyle({ zIndex: String(tokens.layer.overlay) });
    expect(screen.getByTestId("dlg")).toHaveStyle({ zIndex: String(tokens.layer.modal) });
  });
});

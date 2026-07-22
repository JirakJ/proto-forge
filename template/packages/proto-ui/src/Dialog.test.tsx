import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Dialog, type DialogProps } from "./Dialog";
import { ProtoUIProvider, type ProviderKind } from "../providers/index";

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
        <Dialog open={false} title="Confirm" onClose={() => {}}>
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

  it("closes on overlay click but not on content click", async () => {
    const user = userEvent.setup();
    let closed = 0;
    renderDialog("own", { onClose: () => (closed += 1) });
    const dlg = screen.getByRole("dialog");
    await user.click(dlg);
    expect(closed).toBe(0);
    await user.click(dlg.parentElement as HTMLElement);
    expect(closed).toBe(1);
  });

  it("tears down its key listener when it closes", () => {
    let closed = 0;
    const { rerender } = render(
      <ProtoUIProvider provider="own">
        <Dialog open title="Confirm" onClose={() => (closed += 1)}>
          <p>Body</p>
        </Dialog>
      </ProtoUIProvider>,
    );
    rerender(
      <ProtoUIProvider provider="own">
        <Dialog open={false} title="Confirm" onClose={() => (closed += 1)}>
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
        <Dialog open title="Confirm" onClose={() => calls.push("a")}>
          <button data-testid="inner">x</button>
        </Dialog>
      </ProtoUIProvider>,
    );
    const inner = screen.getByTestId("inner");
    inner.focus();
    expect(document.activeElement).toBe(inner);
    rerender(
      <ProtoUIProvider provider="own">
        <Dialog open title="Confirm" onClose={() => calls.push("b")}>
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
});

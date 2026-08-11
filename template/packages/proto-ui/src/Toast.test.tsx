import { render, screen, fireEvent, act } from "@testing-library/react";
import { ToastProvider, useToast } from "./Toast";
import { OVERLAY_ROOT_ID } from "./Portal";
import { tokens } from "../tokens";

function Harness() {
  const { notify } = useToast();
  return (
    <>
      <button data-testid="info" onClick={() => notify("Saved")}>
        info
      </button>
      <button data-testid="err" onClick={() => notify("Failed", "error")}>
        err
      </button>
    </>
  );
}

const toasts = () => screen.queryAllByTestId(/^toast-t\d+$/);

describe("Toast", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("throws when useToast is used outside a provider", () => {
    expect(() => render(<Harness />)).toThrow(/ToastProvider/);
  });

  it("names its live region from the caller-supplied label", () => {
    render(
      <ToastProvider label="Notifications" duration={1000}>
        <Harness />
      </ToastProvider>,
    );
    expect(screen.getByTestId("toast-region")).toHaveAttribute("aria-label", "Notifications");
  });

  it("shows polite info and assertive error toasts, then auto-dismisses", () => {
    render(
      <ToastProvider label="Notifications" duration={1000}>
        <Harness />
      </ToastProvider>,
    );

    fireEvent.click(screen.getByTestId("info"));
    const [info] = toasts();
    expect(info).toHaveAttribute("role", "status");
    expect(info).toHaveTextContent("Saved");

    fireEvent.click(screen.getByTestId("err"));
    expect(toasts().some((el) => el.getAttribute("role") === "alert")).toBe(true);
    // Each toast is individually addressable — no repeated testid (BR-02).
    expect(new Set(toasts().map((el) => el.dataset.testid)).size).toBe(2);

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(toasts()).toHaveLength(0);
  });

  it("renders the region in the body-level portal at the top of the layer scale", () => {
    render(
      <ToastProvider label="Notifications">
        <Harness />
      </ToastProvider>,
    );
    const region = screen.getByTestId("toast-region");
    expect(document.getElementById(OVERLAY_ROOT_ID)).toContainElement(region);
    expect(region).toHaveStyle({ position: "fixed", zIndex: String(tokens.layer.toast) });
    expect(tokens.layer.toast).toBeGreaterThan(tokens.layer.modal);
    expect(tokens.layer.toast).toBeGreaterThan(tokens.layer.popover);
  });
});

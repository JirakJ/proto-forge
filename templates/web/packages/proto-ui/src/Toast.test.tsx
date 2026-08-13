import { render, screen, fireEvent, act } from "@testing-library/react";
import { ToastProvider, useToast } from "./Toast";
import { OVERLAY_ROOT_ID } from "./Portal";
import { ProtoUIProvider } from "../providers/index";
import { tokens } from "../tokens";
import type { Capabilities } from "./overlay/index";

const FALLBACK: Capabilities = { topLayerDialog: false, popover: false, cssAnchor: false };

/** ToastProvider claims a slot, so it needs the library root above it. */
function mount(ui: React.ReactNode) {
  return render(<ProtoUIProvider capabilities={FALLBACK}>{ui}</ProtoUIProvider>);
}

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
    expect(() => mount(<Harness />)).toThrow(/ToastProvider/);
  });

  it("names its live region from the caller-supplied label", () => {
    mount(
      <ToastProvider label="Notifications" duration={1000}>
        <Harness />
      </ToastProvider>,
    );
    expect(screen.getByTestId("toast-region")).toHaveAttribute("aria-label", "Notifications");
  });

  it("shows polite info and assertive error toasts, then auto-dismisses", () => {
    mount(
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

  it("renders the region in the body-level portal, above the app chrome", () => {
    mount(
      <ToastProvider label="Notifications">
        <Harness />
      </ToastProvider>,
    );
    const region = screen.getByTestId("toast-region");
    expect(document.getElementById(OVERLAY_ROOT_ID)).toContainElement(region);
    expect(region).toHaveStyle({ position: "fixed" });
  });

  it("claims a slot only while it has something to show", () => {
    mount(
      <ToastProvider label="Notifications" duration={1000}>
        <Harness />
      </ToastProvider>,
    );
    const region = screen.getByTestId("toast-region");
    // Empty: off the scale entirely, so an empty region cannot sit above a dialog.
    expect(Number(region.style.zIndex)).toBe(tokens.layer.base);

    fireEvent.click(screen.getByTestId("info"));
    expect(Number(screen.getByTestId("toast-region").style.zIndex)).toBeGreaterThan(tokens.layer.sticky);

    // Emptying releases the slot again. Promoting per batch rather than once at mount is
    // what makes a toast land above whatever was open when it was raised.
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(Number(screen.getByTestId("toast-region").style.zIndex)).toBe(tokens.layer.base);
  });
});

import { render, screen, fireEvent, act } from "@testing-library/react";
import { ToastProvider, useToast } from "./Toast";

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

describe("Toast", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("throws when useToast is used outside a provider", () => {
    expect(() => render(<Harness />)).toThrow(/ToastProvider/);
  });

  it("shows polite info and assertive error toasts, then auto-dismisses", () => {
    render(
      <ToastProvider duration={1000}>
        <Harness />
      </ToastProvider>,
    );

    fireEvent.click(screen.getByTestId("info"));
    const info = screen.getByTestId("toast");
    expect(info).toHaveAttribute("role", "status");
    expect(info).toHaveTextContent("Saved");

    fireEvent.click(screen.getByTestId("err"));
    const toasts = screen.getAllByTestId("toast");
    expect(toasts.some((el) => el.getAttribute("role") === "alert")).toBe(true);

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.queryAllByTestId("toast")).toHaveLength(0);
  });
});

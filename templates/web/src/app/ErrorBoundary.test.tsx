import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@/i18n";
import { ErrorBoundary } from "./ErrorBoundary";

let shouldCrash = false;

function Flaky() {
  if (shouldCrash) throw new Error("render crash");
  return <p data-testid="child">child</p>;
}

describe("ErrorBoundary", () => {
  beforeEach(() => {
    shouldCrash = false;
    // React re-throws to console on a caught render error; keep the run readable.
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders children while nothing throws", () => {
    render(
      <ErrorBoundary>
        <Flaky />
      </ErrorBoundary>,
    );
    expect(screen.getByTestId("child")).toBeInTheDocument();
    expect(screen.queryByTestId("error-boundary")).toBeNull();
  });

  it("shows an announced fallback instead of a blank page when a child throws", () => {
    shouldCrash = true;
    render(
      <ErrorBoundary>
        <Flaky />
      </ErrorBoundary>,
    );
    expect(screen.getByRole("alert")).toHaveAttribute("data-testid", "error-boundary");
    expect(screen.queryByTestId("child")).toBeNull();
  });

  it("recovers when retry is pressed and the cause is gone", async () => {
    const user = userEvent.setup();
    shouldCrash = true;
    render(
      <ErrorBoundary>
        <Flaky />
      </ErrorBoundary>,
    );
    shouldCrash = false;
    await user.click(screen.getByTestId("error-retry"));
    expect(screen.getByTestId("child")).toBeInTheDocument();
    expect(screen.queryByTestId("error-boundary")).toBeNull();
  });
});

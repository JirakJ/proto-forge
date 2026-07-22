import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef } from "react";
import { Button } from "./Button";
import { tokens } from "../tokens";

describe("Button", () => {
  it("renders as a non-submitting button by default with the given testid", () => {
    render(
      <Button data-testid="b" onClick={() => {}}>
        Go
      </Button>,
    );
    const btn = screen.getByTestId("b");
    expect(btn).toHaveTextContent("Go");
    expect(btn).toHaveAttribute("type", "button");
  });

  it("fires onClick when enabled", async () => {
    const user = userEvent.setup();
    let clicks = 0;
    render(
      <Button data-testid="b" onClick={() => (clicks += 1)}>
        Go
      </Button>,
    );
    await user.click(screen.getByTestId("b"));
    expect(clicks).toBe(1);
  });

  it("applies the secondary variant styling", () => {
    render(
      <Button data-testid="b" variant="secondary">
        Go
      </Button>,
    );
    expect(screen.getByTestId("b")).toHaveStyle({ background: tokens.color.bg });
  });

  it("applies the danger variant styling", () => {
    render(
      <Button data-testid="b" variant="danger">
        Go
      </Button>,
    );
    expect(screen.getByTestId("b")).toHaveStyle({ background: tokens.color.danger });
  });

  it("shows a not-allowed cursor and blocks clicks when disabled", async () => {
    const user = userEvent.setup();
    let clicks = 0;
    render(
      <Button data-testid="b" disabled onClick={() => (clicks += 1)}>
        Go
      </Button>,
    );
    const btn = screen.getByTestId("b");
    expect(btn).toHaveStyle({ cursor: "not-allowed" });
    await user.click(btn);
    expect(clicks).toBe(0);
  });

  it("merges caller style and forwards the ref", () => {
    const ref = createRef<HTMLButtonElement>();
    render(
      <Button data-testid="b" ref={ref} style={{ marginBlockStart: "10px" }}>
        Go
      </Button>,
    );
    expect(ref.current).toBe(screen.getByTestId("b"));
    expect(screen.getByTestId("b")).toHaveStyle({ marginBlockStart: "10px" });
  });
});

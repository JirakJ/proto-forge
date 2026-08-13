import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Checkbox } from "./Checkbox";

describe("Checkbox", () => {
  it("associates the label and reports no error by default", () => {
    render(<Checkbox label="Pinned" data-testid="c" />);
    const box = screen.getByLabelText("Pinned");
    expect(box).toBe(screen.getByTestId("c"));
    expect(box).toHaveAttribute("type", "checkbox");
    expect(box).not.toHaveAttribute("aria-invalid");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("treats an empty-string error as no error", () => {
    render(<Checkbox label="Pinned" error="" data-testid="c" />);
    expect(screen.getByTestId("c")).not.toHaveAttribute("aria-invalid");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("announces the error and links it via aria-describedby", () => {
    render(<Checkbox label="Pinned" error="Required" data-testid="c" />);
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Required");
    expect(screen.getByTestId("c")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByTestId("c").getAttribute("aria-describedby")).toBe(alert.id);
  });

  it("toggles by click and by keyboard, and merges caller style", async () => {
    const user = userEvent.setup();
    let checked = false;
    render(
      <Checkbox
        label="Pinned"
        data-testid="c"
        style={{ marginBlockStart: "4px" }}
        onChange={(e) => (checked = e.target.checked)}
      />,
    );
    const box = screen.getByTestId("c");
    expect(box).toHaveStyle({ marginBlockStart: "4px" });
    await user.click(box);
    expect(checked).toBe(true);
    await user.keyboard(" ");
    expect(checked).toBe(false);
  });
});

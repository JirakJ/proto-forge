import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Field } from "./Field";

describe("Field", () => {
  it("associates the label with the input and reports no error by default", () => {
    render(<Field label="Name" data-testid="f" />);
    const input = screen.getByLabelText("Name");
    expect(input).toBe(screen.getByTestId("f"));
    expect(input).not.toHaveAttribute("aria-invalid");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("treats an empty-string error as no error", () => {
    render(<Field label="Name" error="" data-testid="f" />);
    expect(screen.getByTestId("f")).not.toHaveAttribute("aria-invalid");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("announces the error and links it via aria-describedby", () => {
    render(<Field label="Name" error="Required" data-testid="f" />);
    const input = screen.getByTestId("f");
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Required");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input.getAttribute("aria-describedby")).toBe(alert.id);
  });

  it("accepts typed input and merges caller style", async () => {
    const user = userEvent.setup();
    let value = "";
    render(
      <Field
        label="Name"
        data-testid="f"
        style={{ marginBlockStart: "4px" }}
        onChange={(e) => (value = e.target.value)}
      />,
    );
    const input = screen.getByTestId("f");
    expect(input).toHaveStyle({ marginBlockStart: "4px" });
    await user.type(input, "hi");
    expect(value).toBe("hi");
  });
});

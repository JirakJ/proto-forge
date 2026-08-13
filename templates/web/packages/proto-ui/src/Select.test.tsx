import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Select } from "./Select";

const options = [
  { value: "a", label: "Alpha" },
  { value: "b", label: "Beta" },
];

describe("Select", () => {
  it("associates the label, renders the options, and reports no error by default", () => {
    render(<Select label="Kind" options={options} data-testid="s" />);
    const select = screen.getByLabelText("Kind");
    expect(select).toBe(screen.getByTestId("s"));
    expect(select).not.toHaveAttribute("aria-invalid");
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual(["Alpha", "Beta"]);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("treats an empty-string error as no error", () => {
    render(<Select label="Kind" options={options} error="" data-testid="s" />);
    expect(screen.getByTestId("s")).not.toHaveAttribute("aria-invalid");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("announces the error and links it via aria-describedby", () => {
    render(<Select label="Kind" options={options} error="Pick one" data-testid="s" />);
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Pick one");
    expect(screen.getByTestId("s")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByTestId("s").getAttribute("aria-describedby")).toBe(alert.id);
  });

  it("selects by keyboard/pointer and merges caller style", async () => {
    const user = userEvent.setup();
    let value = "";
    render(
      <Select
        label="Kind"
        options={options}
        data-testid="s"
        style={{ marginBlockStart: "4px" }}
        onChange={(e) => (value = e.target.value)}
      />,
    );
    const select = screen.getByTestId("s");
    expect(select).toHaveStyle({ marginBlockStart: "4px" });
    await user.selectOptions(select, "b");
    expect(value).toBe("b");
  });
});

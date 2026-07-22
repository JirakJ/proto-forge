import { render, screen } from "@testing-library/react";
import { Table, type Column } from "./Table";

type Row = { id: string; name: string; note: string | null };

const columns: Column<Row>[] = [
  { key: "name", header: "Name" },
  { key: "note", header: "Note" },
  { key: "id", header: "Actions", render: (r) => <button data-testid={`act-${r.id}`}>Go</button> },
];

describe("Table", () => {
  it("renders caption, scoped headers, and rows (custom render + nullish cell)", () => {
    render(
      <Table
        caption="People"
        data-testid="t"
        columns={columns}
        rowKey={(r) => r.id}
        rows={[
          { id: "1", name: "Ada", note: "hi" },
          { id: "2", name: "Grace", note: null },
        ]}
      />,
    );
    expect(screen.getByTestId("t")).toContainElement(screen.getByText("People"));
    expect(screen.getByRole("columnheader", { name: "Name" })).toHaveAttribute("scope", "col");
    expect(screen.getAllByTestId("table-row")).toHaveLength(2);
    expect(screen.getByText("Ada")).toBeInTheDocument();
    expect(screen.getByTestId("act-1")).toBeInTheDocument(); // custom render column
    // nullish note renders as an empty cell without throwing
    expect(screen.getByText("Grace").closest("tr")).toBeInTheDocument();
  });

  it("shows the empty label when there are no rows", () => {
    render(<Table caption="People" columns={columns} rowKey={(r) => r.id} rows={[]} emptyLabel="None" />);
    expect(screen.getByTestId("table-empty")).toHaveTextContent("None");
    expect(screen.queryAllByTestId("table-row")).toHaveLength(0);
  });

  it("defaults the empty label", () => {
    render(<Table caption="People" columns={columns} rowKey={(r) => r.id} rows={[]} />);
    expect(screen.getByTestId("table-empty")).toHaveTextContent("—");
  });
});

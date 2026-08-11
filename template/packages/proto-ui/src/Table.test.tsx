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
        emptyLabel="None"
        columns={columns}
        rowKey={(r) => r.id}
        rows={[
          { id: "1", name: "Ada", note: "hi" },
          { id: "2", name: "Grace", note: null },
        ]}
      />,
    );
    expect(screen.getByTestId("t")).toContainElement(screen.getByTestId("t-caption"));
    expect(screen.getByTestId("t-caption")).toHaveTextContent("People");
    expect(screen.getByTestId("t-header-name")).toHaveAttribute("scope", "col");
    expect(screen.getByRole("columnheader", { name: "Name" })).toBe(screen.getByTestId("t-header-name"));
    expect(screen.getByTestId("t-row-1")).toBeInTheDocument();
    expect(screen.getByTestId("t-row-2")).toBeInTheDocument();
    expect(screen.getByTestId("t-cell-1-name")).toHaveTextContent("Ada");
    expect(screen.getByTestId("act-1")).toBeInTheDocument(); // custom render column
    // nullish note renders as an empty cell without throwing
    expect(screen.getByTestId("t-cell-2-note")).toBeEmptyDOMElement();
  });

  it("gives every row and cell a distinct testid so each is individually addressable", () => {
    render(
      <Table
        caption="People"
        data-testid="t"
        emptyLabel="None"
        columns={columns}
        rowKey={(r) => r.id}
        rows={[
          { id: "1", name: "Ada", note: "hi" },
          { id: "2", name: "Grace", note: "yo" },
        ]}
      />,
    );
    const ids = [...screen.getByTestId("t").querySelectorAll("[data-testid]")].map(
      (el) => el.getAttribute("data-testid")!,
    );
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("shows the empty label when there are no rows", () => {
    render(
      <Table
        caption="People"
        data-testid="t"
        columns={columns}
        rowKey={(r) => r.id}
        rows={[]}
        emptyLabel="None"
      />,
    );
    expect(screen.getByTestId("t-empty")).toHaveTextContent("None");
    expect(screen.queryByTestId("t-row-1")).toBeNull();
  });
});

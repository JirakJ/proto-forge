import { type ReactNode } from "react";
import { tokens } from "../tokens";

export type Column<T> = {
  key: keyof T & string;
  /** Already translated by the caller — never a literal (BR-08). */
  header: string;
  render?: (row: T) => ReactNode;
};

export type TableProps<T> = {
  caption: string;
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  /** Shown when `rows` is empty. Required so the empty state is translated too. */
  emptyLabel: string;
  "data-testid": string;
};

// Semantic data table: caption + scoped column headers. Every string (caption,
// headers, emptyLabel) is passed in already translated — the library ships no copy.
// Every cell carries a testid derived from the table's testid + rowKey + column
// key, so each one is addressable and globally unique (BR-02).
export function Table<T>({ caption, columns, rows, rowKey, emptyLabel, "data-testid": testid }: TableProps<T>) {
  const cell = {
    padding: tokens.space.sm,
    borderBlockEnd: `1px solid ${tokens.color.border}`,
    textAlign: "start" as const,
  };
  return (
    <table
      data-testid={testid}
      style={{ borderCollapse: "collapse", width: "100%", color: tokens.color.fg }}
    >
      <caption
        data-testid={`${testid}-caption`}
        style={{ textAlign: "start", marginBlockEnd: tokens.space.sm, color: tokens.color.muted }}
      >
        {caption}
      </caption>
      <thead data-testid={`${testid}-thead`}>
        <tr data-testid={`${testid}-head`}>
          {columns.map((c) => (
            <th
              key={c.key}
              scope="col"
              data-testid={`${testid}-header-${c.key}`}
              style={{ ...cell, fontSize: tokens.font.sizeSm }}
            >
              {c.header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody data-testid={`${testid}-tbody`}>
        {rows.length === 0 ? (
          <tr data-testid={`${testid}-empty-row`}>
            <td
              colSpan={columns.length}
              data-testid={`${testid}-empty`}
              style={{ ...cell, color: tokens.color.muted }}
            >
              {emptyLabel}
            </td>
          </tr>
        ) : (
          rows.map((row) => (
            <tr key={rowKey(row)} data-testid={`${testid}-row-${rowKey(row)}`}>
              {columns.map((c) => (
                <td key={c.key} data-testid={`${testid}-cell-${rowKey(row)}-${c.key}`} style={cell}>
                  {c.render ? c.render(row) : String(row[c.key] ?? "")}
                </td>
              ))}
            </tr>
          ))
        )}
      </tbody>
    </table>
  );
}

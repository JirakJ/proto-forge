import { type ReactNode } from "react";
import { tokens } from "../tokens";

export type Column<T> = {
  key: keyof T & string;
  header: string;
  render?: (row: T) => ReactNode;
};

export type TableProps<T> = {
  caption: string;
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  emptyLabel?: string;
  "data-testid"?: string;
};

// Semantic data table: caption + scoped column headers. Strings (caption/headers/
// emptyLabel) are passed in by the consumer already translated.
export function Table<T>({ caption, columns, rows, rowKey, emptyLabel = "—", "data-testid": testid }: TableProps<T>) {
  const cell = { padding: tokens.space.sm, borderBlockEnd: `1px solid ${tokens.color.border}`, textAlign: "start" as const };
  return (
    <table data-testid={testid} style={{ borderCollapse: "collapse", width: "100%", color: tokens.color.fg }}>
      <caption style={{ textAlign: "start", marginBlockEnd: tokens.space.sm, color: tokens.color.muted }}>
        {caption}
      </caption>
      <thead>
        <tr>
          {columns.map((c) => (
            <th key={c.key} scope="col" style={{ ...cell, fontSize: tokens.font.sizeSm }}>
              {c.header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 ? (
          <tr>
            <td colSpan={columns.length} data-testid="table-empty" style={{ ...cell, color: tokens.color.muted }}>
              {emptyLabel}
            </td>
          </tr>
        ) : (
          rows.map((row) => (
            <tr key={rowKey(row)} data-testid="table-row">
              {columns.map((c) => (
                <td key={c.key} style={cell}>
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

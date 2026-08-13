import { type InputHTMLAttributes } from "react";
import { FieldShell, controlStyle, useFieldIds } from "./fieldParts";

export type FieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, "id"> & {
  /** Already translated by the caller — never a literal (BR-08). */
  label: string;
  error?: string;
  /** Required (BR-02): the label and the error node derive their testids from it. */
  "data-testid": string;
};

// Label + input + inline error, wired via matching ids and aria-describedby.
// Errors are announced (role=alert).
export function Field({ label, error, style, "data-testid": testid, ...rest }: FieldProps) {
  const { id, invalid, aria, shell } = useFieldIds(error);
  return (
    <FieldShell testid={testid} label={label} {...shell}>
      <input
        id={id}
        {...aria}
        data-testid={testid}
        style={{ ...controlStyle(invalid), ...style }}
        {...rest}
      />
    </FieldShell>
  );
}

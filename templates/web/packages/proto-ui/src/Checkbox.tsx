import { type InputHTMLAttributes } from "react";
import { tokens } from "../tokens";
import { FieldError, FieldLabel, fieldColumn, useFieldIds } from "./fieldParts";

export type CheckboxProps = Omit<InputHTMLAttributes<HTMLInputElement>, "id" | "type"> & {
  /** Already translated by the caller — never a literal (BR-08). */
  label: string;
  error?: string;
  /** Required (BR-02): the label and the error node derive their testids from it. */
  "data-testid": string;
};

// Native checkbox with the label beside it, on the same wiring as Field, so a form
// mixes the two without a second a11y story.
export function Checkbox({ label, error, style, "data-testid": testid, ...rest }: CheckboxProps) {
  const { id, errorId, aria } = useFieldIds(error);
  return (
    <div style={fieldColumn}>
      <span style={{ display: "flex", alignItems: "center", gap: tokens.space.sm }}>
        <input
          id={id}
          type="checkbox"
          {...aria}
          data-testid={testid}
          style={{ accentColor: tokens.color.primary, inlineSize: "16px", blockSize: "16px", ...style }}
          {...rest}
        />
        <FieldLabel htmlFor={id} text={label} size={tokens.font.sizeMd} testid={testid} />
      </span>
      <FieldError id={errorId} error={error} testid={testid} />
    </div>
  );
}

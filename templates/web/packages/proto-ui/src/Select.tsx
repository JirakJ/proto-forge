import { type SelectHTMLAttributes } from "react";
import { tokens } from "../tokens";
import { FieldShell, controlStyle, useFieldIds } from "./fieldParts";

/** `label` is already translated by the caller — never a literal (BR-08). */
export type SelectOption = { value: string; label: string };

export type SelectProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, "id"> & {
  label: string;
  options: readonly SelectOption[];
  error?: string;
  /** Required (BR-02): the label, options and error node derive their testids from it. */
  "data-testid": string;
};

// Label + native <select> + inline error, on the same shell as Field. Native so
// keyboard and screen-reader behaviour is the platform's, not ours.
export function Select({ label, options, error, style, "data-testid": testid, ...rest }: SelectProps) {
  const { id, invalid, aria, shell } = useFieldIds(error);
  const box = {
    ...controlStyle(invalid),
    fontFamily: tokens.font.family,
    background: tokens.color.bg,
    color: tokens.color.fg,
    ...style,
  };
  return (
    <FieldShell testid={testid} label={label} {...shell}>
      <select id={id} {...aria} data-testid={testid} style={box} {...rest}>
        {options.map((o) => (
          <option key={o.value} value={o.value} data-testid={`${testid}-option-${o.value}`}>
            {o.label}
          </option>
        ))}
      </select>
    </FieldShell>
  );
}

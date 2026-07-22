import { useId, type InputHTMLAttributes } from "react";
import { tokens } from "../tokens";

export type FieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, "id"> & {
  label: string;
  error?: string;
};

// Label + input + inline error, wired via matching ids and aria-describedby.
// Errors are announced (role=alert). The consumer supplies data-testid via ...rest.
export function Field({ label, error, style, ...rest }: FieldProps) {
  const id = useId();
  const errorId = `${id}-error`;
  const invalid = error !== undefined && error !== "";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: tokens.space.xs }}>
      <label htmlFor={id} style={{ color: tokens.color.fg, fontSize: tokens.font.sizeSm }}>
        {label}
      </label>
      <input
        id={id}
        aria-invalid={invalid || undefined}
        aria-describedby={invalid ? errorId : undefined}
        style={{
          padding: tokens.space.sm,
          borderRadius: tokens.radius.sm,
          border: `1px solid ${invalid ? tokens.color.danger : tokens.color.border}`,
          fontSize: tokens.font.sizeMd,
          ...style,
        }}
        {...rest}
      />
      {invalid ? (
        <span
          id={errorId}
          role="alert"
          style={{ color: tokens.color.danger, fontSize: tokens.font.sizeSm }}
        >
          {error}
        </span>
      ) : null}
    </div>
  );
}

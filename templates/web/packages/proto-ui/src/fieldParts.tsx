import { useId, type CSSProperties, type ReactNode } from "react";
import { tokens } from "../tokens";

// Internal wiring shared by the form primitives (Field, Select, Checkbox): one id
// contract, one aria contract, one error presentation, one testid convention. Not
// part of the public surface — consumers compose the primitives, never these parts.

export function useFieldIds(error: string | undefined) {
  const id = useId();
  const errorId = `${id}-error`;
  const invalid = error !== undefined && error !== "";
  return {
    id,
    errorId,
    invalid,
    aria: {
      "aria-invalid": invalid || undefined,
      "aria-describedby": invalid ? errorId : undefined,
    },
    // Pre-bundled for <FieldShell {...shell}>. Passing the six values one by one at
    // each call site made Field and Select byte-identical for eleven lines, which
    // the duplication gate — correctly — read as the same code written twice.
    shell: { htmlFor: id, errorId, error },
  };
}

export const fieldColumn: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: tokens.space.xs,
};

export const controlStyle = (invalid: boolean): CSSProperties => ({
  padding: tokens.space.sm,
  borderRadius: tokens.radius.sm,
  border: `1px solid ${invalid ? tokens.color.danger : tokens.color.border}`,
  fontSize: tokens.font.sizeMd,
});

export type ShellIds = { htmlFor: string; errorId: string; error: string | undefined };

/**
 * Label above, control, error below — the arrangement Field and Select share
 * exactly. Owning it here means the two cannot drift into different spacing or a
 * differently-wired error node. Checkbox deliberately does NOT use it: its label
 * sits beside the control, which is a different layout, not a variant of this one.
 */
export function FieldShell({
  testid,
  label,
  htmlFor,
  errorId,
  error,
  children,
}: ShellIds & { testid: string; label: string; children: ReactNode }) {
  return (
    <div style={fieldColumn}>
      <FieldLabel htmlFor={htmlFor} text={label} size={tokens.font.sizeSm} testid={testid} />
      {children}
      <FieldError id={errorId} error={error} testid={testid} />
    </div>
  );
}

export function FieldLabel({
  htmlFor,
  text,
  size,
  testid,
}: {
  htmlFor: string;
  text: string;
  size: string;
  testid: string;
}) {
  return (
    <label htmlFor={htmlFor} data-testid={`${testid}-label`} style={{ color: tokens.color.fg, fontSize: size }}>
      {text}
    </label>
  );
}

export function FieldError({
  id,
  error,
  testid,
}: {
  id: string;
  error: string | undefined;
  testid: string;
}) {
  if (error === undefined || error === "") return null;
  return (
    <span
      id={id}
      role="alert"
      data-testid={`${testid}-error`}
      style={{ color: tokens.color.danger, fontSize: tokens.font.sizeSm }}
    >
      {error}
    </span>
  );
}

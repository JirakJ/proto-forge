import { forwardRef, type ButtonHTMLAttributes, type CSSProperties } from "react";
import { tokens } from "../tokens";

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger";
};

function variantStyle(variant: NonNullable<ButtonProps["variant"]>): CSSProperties {
  if (variant === "danger") {
    return { background: tokens.color.danger, color: tokens.color.primaryFg, border: "none" };
  }
  if (variant === "secondary") {
    return { background: tokens.color.bg, color: tokens.color.fg, border: `1px solid ${tokens.color.border}` };
  }
  return { background: tokens.color.primary, color: tokens.color.primaryFg, border: "none" };
}

// The consumer supplies data-testid via ...rest; the require-testid lint rule
// skips elements that spread props.
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", type = "button", style, children, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      style={{
        padding: `${tokens.space.sm} ${tokens.space.md}`,
        borderRadius: tokens.radius.sm,
        fontSize: tokens.font.sizeMd,
        fontFamily: tokens.font.family,
        cursor: rest.disabled ? "not-allowed" : "pointer",
        ...variantStyle(variant),
        ...style,
      }}
      {...rest}
    >
      {children}
    </button>
  );
});

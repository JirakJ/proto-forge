// The single source of design tokens (BRS §12.3). Every colour is pre-validated
// for WCAG 2.2 AA contrast on the default light background; `axe` re-checks the
// rendered output. Nothing else in the tree may define a colour/space/radius.

export const tokens = {
  color: {
    bg: "#ffffff",
    fg: "#1a1a1a", // ~16:1 on bg
    primary: "#1d4ed8", // ~5.6:1 on bg (AA text)
    primaryFg: "#ffffff", // ~5.6:1 on primary
    danger: "#b91c1c", // ~5.9:1 on bg
    border: "#767676", // 4.5:1 on bg (>=3:1 non-text)
    muted: "#595959", // ~7:1 on bg
    focus: "#1d4ed8",
  },
  space: { xs: "4px", sm: "8px", md: "16px", lg: "24px" },
  radius: { sm: "4px", md: "8px" },
  font: {
    family: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
    sizeSm: "14px",
    sizeMd: "16px",
    sizeLg: "20px",
  },
  focusRing: "0 0 0 3px rgba(29, 78, 216, 0.5)",
} as const;

export type Tokens = typeof tokens;

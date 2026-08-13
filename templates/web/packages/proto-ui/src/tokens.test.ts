import { tokens, tokensCssProperties, tokensCssNames } from "../tokens";

// The overlay stylesheet needs design values in CSS, so the custom properties are
// derived from `tokens` rather than typed out again. These assertions are the unit half
// of that guarantee; `consistency` is the other half, checking that the stylesheet uses
// nothing this generator does not produce.
//
// NOTE: tokens.ts sits outside the coverage include (packages/proto-ui/src/**), so the
// generator would otherwise be untested logic in the one file the whole design depends
// on. The include is widened when the coverage policy lands.

describe("tokensCssProperties", () => {
  it("emits one declaration per token, kebab-cased", () => {
    expect(tokensCssProperties).toContain(`--pf-color-bg: ${tokens.color.bg};`);
    expect(tokensCssProperties).toContain(`--pf-space-md: ${tokens.space.md};`);
    expect(tokensCssProperties).toContain(`--pf-radius-md: ${tokens.radius.md};`);
  });

  it("kebab-cases a camelCase leaf, so primaryFg is addressable from CSS", () => {
    expect(tokensCssProperties).toContain(`--pf-color-primary-fg: ${tokens.color.primaryFg};`);
    expect(tokensCssProperties).toContain(`--pf-font-size-lg: ${tokens.font.sizeLg};`);
  });

  it("emits top-level scalars without a group segment", () => {
    expect(tokensCssProperties).toContain(`--pf-focus-ring: ${tokens.focusRing};`);
  });

  it("emits numeric tokens as numbers rather than dropping them", () => {
    expect(tokensCssProperties).toContain(`--pf-layer-overlay: ${tokens.layer.overlay};`);
  });

  it("covers every leaf token exactly once", () => {
    const leaves = Object.values(tokens).reduce(
      (n, group) => n + (typeof group === "object" ? Object.keys(group).length : 1),
      0,
    );
    expect(tokensCssNames).toHaveLength(leaves);
    expect(new Set(tokensCssNames).size).toBe(leaves);
  });

  it("names every property with the --pf- prefix, so the mirror check can find them", () => {
    for (const name of tokensCssNames) expect(name).toMatch(/^--pf-[a-z0-9-]+$/);
  });
});

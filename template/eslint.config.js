import js from "@eslint/js";
import tseslint from "typescript-eslint";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import security from "eslint-plugin-security";
import noUnsanitized from "eslint-plugin-no-unsanitized";
import i18next from "eslint-plugin-i18next";
import boundaries from "eslint-plugin-boundaries";

// --- Local rule: require a stable data-testid on interactive elements (BR-02). ---
// Interactive intrinsic elements must carry data-testid so E2E selectors are stable.
// Skips elements that spread props ({...rest}) — can't statically prove absence.
const INTERACTIVE = new Set(["button", "input", "select", "textarea"]);
const requireTestid = {
  meta: {
    type: "problem",
    docs: { description: "Require data-testid on interactive elements" },
    schema: [],
    messages: { missing: "Interactive <{{name}}> needs a stable data-testid (BR-02)." },
  },
  create(context) {
    // proto-ui primitives forward data-testid via {...rest}; a spread is not proof
    // of a testid elsewhere, so outside proto-ui require an explicit data-testid.
    const inProtoUi = context.filename.includes("packages/proto-ui");
    return {
      JSXOpeningElement(node) {
        const name = node.name?.name;
        if (typeof name !== "string") return;
        const interactive =
          INTERACTIVE.has(name) || (name === "a" && (hasAttr(node, "href") || hasAttr(node, "onClick")));
        if (!interactive) return;
        if (hasAttr(node, "data-testid")) return;
        if (inProtoUi && hasSpread(node)) return;
        context.report({ node, messageId: "missing", data: { name } });
      },
    };
  },
};
const hasAttr = (node, attr) =>
  node.attributes.some((a) => a.type === "JSXAttribute" && a.name?.name === attr);
const hasSpread = (node) => node.attributes.some((a) => a.type === "JSXSpreadAttribute");

// --- Local rule: user-facing attribute strings must be i18n keys (BR-08). ---
// Catches literal aria-label/placeholder/title/alt — the a11y strings the jsx-text
// i18next rule can't see. `aria-label={t('...')}` (an expression) is fine.
const I18N_ATTRS = new Set(["label", "aria-label", "aria-description", "placeholder", "title", "alt"]);
const requireI18nAttr = {
  meta: {
    type: "problem",
    docs: { description: "User-facing attribute strings must be i18n keys" },
    schema: [],
    messages: { literal: "User-facing attribute '{{attr}}' must be a t() key, not a literal (BR-08)." },
  },
  create(context) {
    return {
      JSXAttribute(node) {
        const attr = node.name?.name;
        if (typeof attr !== "string" || !I18N_ATTRS.has(attr)) return;
        const v = node.value;
        if (v && v.type === "Literal" && typeof v.value === "string" && v.value.trim() !== "") {
          context.report({ node, messageId: "literal", data: { attr } });
        }
      },
    };
  },
};

const local = { rules: { "require-testid": requireTestid, "require-i18n-attr": requireI18nAttr } };

export default tseslint.config(
  {
    ignores: [
      "dist/**",
      "coverage/**",
      "playwright-report/**",
      "test-results/**",
      "scripts/**",
      "**/*.config.{ts,js,mjs}",
      "src/i18n/resources.d.ts",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    settings: {
      react: { version: "detect" },
      "import/resolver": { typescript: { project: "./tsconfig.json" } },
      "boundaries/include": ["src/**/*", "packages/proto-ui/src/**/*"],
      "boundaries/elements": [
        { type: "ui", pattern: "packages/proto-ui/src/**/*" },
        { type: "config", pattern: "src/config/**/*" },
        { type: "i18n", pattern: "src/i18n/**/*" },
        { type: "domain", pattern: "src/domain/**/*" },
        { type: "infra", pattern: "src/infra/**/*" },
        { type: "shared", pattern: "src/shared/**/*" },
        { type: "features", pattern: "src/features/**/*" },
        { type: "app", pattern: "src/app/**/*" },
      ],
    },
    plugins: {
      react,
      "react-hooks": reactHooks,
      security,
      "no-unsanitized": noUnsanitized,
      boundaries,
      local,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      ...security.configs.recommended.rules,
      "no-unsanitized/method": "error",
      "no-unsanitized/property": "error",
      "react/no-danger": "error", // raw HTML only via <SafeHtml> (BRS §4.1)
      "local/require-testid": "error",
      // DDD import boundaries (NFR-04). External deps (react, zod, …) are not elements.
      "boundaries/element-types": [
        "error",
        {
          default: "disallow",
          rules: [
            { from: "ui", allow: ["ui"] },
            { from: "config", allow: ["config"] },
            { from: "i18n", allow: ["i18n", "config"] },
            { from: "domain", allow: ["domain", "config"] },
            { from: "infra", allow: ["infra", "domain", "config", "shared"] },
            { from: "shared", allow: ["shared", "ui", "config", "i18n"] },
            { from: "features", allow: ["features", "ui", "domain", "infra", "i18n", "shared", "config"] },
            { from: "app", allow: ["app", "features", "ui", "domain", "infra", "i18n", "shared", "config"] },
          ],
        },
      ],
    },
  },
  // No literal user-facing text in feature/app JSX (BR-08). proto-ui primitives take
  // strings as props, so they are exempt. §6.1 allowlist: code elements + punctuation.
  {
    files: ["src/features/**/*.{ts,tsx}", "src/app/**/*.{ts,tsx}"],
    plugins: { i18next, local },
    rules: {
      "i18next/no-literal-string": [
        "error",
        {
          mode: "jsx-text-only",
          "jsx-components": { exclude: ["code", "pre", "kbd", "samp", "Trans"] },
          words: { exclude: ["—", "/", "·", "•", ":", "-", "|", "×", "·"] },
        },
      ],
      "local/require-i18n-attr": "error",
    },
  },
  // Tests may use fixtures and literal strings freely.
  {
    files: ["**/*.test.{ts,tsx}", "**/*.e2e.ts", "**/__fixtures__/**"],
    rules: {
      "i18next/no-literal-string": "off",
      "local/require-testid": "off",
      "boundaries/element-types": "off",
    },
  },
);

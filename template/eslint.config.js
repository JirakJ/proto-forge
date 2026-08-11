import js from "@eslint/js";
import tseslint from "typescript-eslint";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import security from "eslint-plugin-security";
import noUnsanitized from "eslint-plugin-no-unsanitized";
import i18next from "eslint-plugin-i18next";
import boundaries from "eslint-plugin-boundaries";

const hasAttr = (node, attr) =>
  node.attributes.some((a) => a.type === "JSXAttribute" && a.name?.name === attr);
const hasSpread = (node) => node.attributes.some((a) => a.type === "JSXSpreadAttribute");
const attrValue = (node, attr) =>
  node.attributes.find((a) => a.type === "JSXAttribute" && a.name?.name === attr)?.value;

// --- Local rule: every addressable element carries a data-testid (BR-02). ------
// Scope is "interactive + semantic": anything the user operates, anything that
// carries meaning (headings, landmarks, list items, cells, media, form parts) and
// anything wearing an explicit ARIA role. Pure layout wrappers — a <div> or <span>
// that exists only to hold flexbox — are exempt, because naming them adds noise
// without adding a selector anyone would write.
const INTERACTIVE = new Set([
  "button", "input", "select", "textarea", "details", "summary", "dialog", "form", "output",
]);
const SEMANTIC = new Set([
  "h1", "h2", "h3", "h4", "h5", "h6",
  "header", "nav", "main", "aside", "footer", "section", "article",
  "ul", "ol", "li", "dl", "dt", "dd",
  "table", "thead", "tbody", "tfoot", "tr", "td", "th", "caption",
  "img", "figure", "figcaption", "video", "audio",
  "label", "legend", "fieldset", "option", "optgroup", "blockquote", "time", "progress", "meter",
]);

const requireTestid = {
  meta: {
    type: "problem",
    docs: { description: "Require data-testid on interactive and semantic elements" },
    schema: [],
    messages: { missing: "<{{name}}> needs a stable data-testid so a test can address it (BR-02)." },
  },
  create(context) {
    // proto-ui primitives forward data-testid via {...rest}; a spread is not proof
    // of a testid elsewhere, so outside proto-ui require an explicit data-testid.
    const inProtoUi = context.filename.includes("packages/proto-ui");
    return {
      JSXOpeningElement(node) {
        const name = node.name?.name;
        if (typeof name !== "string") return;
        const addressable =
          INTERACTIVE.has(name) ||
          SEMANTIC.has(name) ||
          hasAttr(node, "role") ||
          (name === "a" && (hasAttr(node, "href") || hasAttr(node, "onClick")));
        if (!addressable) return;
        if (hasAttr(node, "data-testid")) return;
        if (inProtoUi && hasSpread(node)) return;
        context.report({ node, messageId: "missing", data: { name } });
      },
    };
  },
};

// --- Local rule: a data-testid must actually identify ONE element (BR-02). -----
// Two failure modes, both invisible to a per-element check: the same literal used
// twice in a file, and a static literal inside a .map() — which renders N elements
// wearing one name, so getByTestId silently returns the first row forever.
const LIST_METHODS = new Set(["map", "flatMap"]);
const uniqueTestid = {
  meta: {
    type: "problem",
    docs: { description: "data-testid values must be unique and interpolated inside lists" },
    schema: [],
    messages: {
      duplicate: 'data-testid "{{id}}" is already used in this file — one testid, one element (BR-02).',
      inList: 'data-testid "{{id}}" is static but rendered per item — interpolate a stable id, e.g. `{{id}}-${item.id}` (BR-02).',
    },
  },
  create(context) {
    const seen = new Map();
    return {
      JSXAttribute(node) {
        if (node.name?.name !== "data-testid") return;
        const literal =
          node.value?.type === "Literal" && typeof node.value.value === "string" ? node.value.value : null;
        if (literal === null) return; // interpolated: uniqueness is proven at runtime

        const previous = seen.get(literal);
        if (previous !== undefined) context.report({ node, messageId: "duplicate", data: { id: literal } });
        seen.set(literal, node);

        const inList = context.sourceCode
          .getAncestors(node)
          .some(
            (a) =>
              (a.type === "ArrowFunctionExpression" || a.type === "FunctionExpression") &&
              a.parent?.type === "CallExpression" &&
              a.parent.callee?.type === "MemberExpression" &&
              LIST_METHODS.has(a.parent.callee.property?.name),
          );
        if (inList) context.report({ node, messageId: "inList", data: { id: literal } });
      },
    };
  },
};

// --- Local rule: no user-facing literal anywhere (BR-08). ---------------------
// The i18next rule sees JSX *text*. It does not see the far more common shape in
// a component library built from props: <Dialog title="Delete note">,
// notify("Saved"), or { header: "Name" } in a column definition. Those are the
// strings that used to ship untranslated while every gate stayed green, so they
// are matched by name — exactly (`title`, `label`, `message`, …) or by suffix
// (`emptyLabel`, `submitText`, `errorMessage`). There is no eslint-disable escape
// hatch by design: the fix is always t('…'), which costs one line.
const USER_FACING_EXACT = new Set([
  "label", "title", "text", "message", "heading", "subheading", "description", "caption",
  "placeholder", "alt", "summary", "legend", "hint", "tooltip", "header", "error", "content",
  "aria-label", "aria-description", "aria-placeholder", "aria-roledescription", "aria-valuetext",
]);
const USER_FACING_SUFFIX = /(Label|Text|Message|Title|Heading|Description|Placeholder|Caption|Hint|Tooltip|Header|Error)$/;
const isUserFacing = (name) =>
  typeof name === "string" && (USER_FACING_EXACT.has(name) || USER_FACING_SUFFIX.test(name));

// Punctuation and separators carry no language, so translating them is noise.
const NON_LINGUISTIC = /^[\s\p{P}\p{S}\d]*$/u;

const staticString = (node) => {
  if (node === null || node === undefined) return null;
  if (node.type === "Literal" && typeof node.value === "string") return node.value;
  if (node.type === "JSXExpressionContainer") return staticString(node.expression);
  if (node.type === "TemplateLiteral" && node.expressions.length === 0) return node.quasis[0].value.cooked;
  return null;
};

const noUserFacingLiteral = {
  meta: {
    type: "problem",
    docs: { description: "User-facing strings must come from the i18n catalogue" },
    schema: [{ type: "object", properties: { properties: { type: "boolean" } }, additionalProperties: false }],
    messages: {
      attribute: "User-facing '{{name}}' must be a t() key, not the literal {{value}} (BR-08).",
      property: "User-facing '{{name}}' must be a t() key, not the literal {{value}} (BR-08).",
    },
  },
  create(context) {
    const checkProperties = context.options[0]?.properties === true;
    const report = (node, messageId, name, value) => {
      if (value === null || value.trim() === "" || NON_LINGUISTIC.test(value)) return;
      context.report({ node, messageId, data: { name, value: JSON.stringify(value) } });
    };
    return {
      JSXAttribute(node) {
        const name = node.name?.name;
        if (!isUserFacing(name)) return;
        report(node, "attribute", name, staticString(node.value));
      },
      Property(node) {
        if (!checkProperties || node.computed) return;
        const name = node.key?.name ?? node.key?.value;
        if (!isUserFacing(name)) return;
        report(node, "property", name, staticString(node.value));
      },
    };
  },
};

const local = {
  rules: {
    "require-testid": requireTestid,
    "unique-testid": uniqueTestid,
    "no-user-facing-literal": noUserFacingLiteral,
  },
};

export default tseslint.config(
  {
    ignores: [
      "dist/**",
      "coverage/**",
      "playwright-report/**",
      "test-results/**",
      "docs/**",
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
      "local/unique-testid": "error",
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
  // No user-facing literal in ANY rendering layer (BR-08) — including the owned
  // library, which used to hard-code its own aria-label and ship it untranslated
  // in every prototype. proto-ui takes every string as a prop; the app supplies
  // t() values. Object properties are checked in the app layers, where column
  // headers and menu items are declared.
  {
    files: [
      "src/features/**/*.{ts,tsx}",
      "src/app/**/*.{ts,tsx}",
      "src/shared/**/*.{ts,tsx}",
      "packages/proto-ui/**/*.{ts,tsx}",
    ],
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
      "local/no-user-facing-literal": "error",
    },
  },
  {
    files: ["src/features/**/*.{ts,tsx}", "src/app/**/*.{ts,tsx}", "src/shared/**/*.{ts,tsx}"],
    plugins: { local },
    rules: { "local/no-user-facing-literal": ["error", { properties: true }] },
  },
  // Tests and the screenshot gallery may use fixtures and literal strings freely:
  // they are the fixtures. The gallery renders every component in every state and
  // never ships in a production build.
  {
    files: ["**/*.test.{ts,tsx}", "**/*.e2e.ts", "**/__fixtures__/**", "src/app/gallery/**"],
    rules: {
      "i18next/no-literal-string": "off",
      "local/no-user-facing-literal": "off",
      "local/require-testid": "off",
      // Reusing "dlg" across separate it() blocks is not a collision — each render
      // is torn down before the next. What matters is uniqueness in the DOM at one
      // moment, and src/test/setup.ts asserts exactly that after every test.
      "local/unique-testid": "off",
      "boundaries/element-types": "off",
    },
  },
);

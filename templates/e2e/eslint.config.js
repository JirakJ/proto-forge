import js from "@eslint/js";
import tseslint from "typescript-eslint";
import security from "eslint-plugin-security";

// @adr 001 - the e2e layer keeps the api-node lint bar minus the boundary rules
//
// strictTypeChecked + the security plugin + the SRP ceilings, exactly like the
// backend template. What is deliberately absent is eslint-plugin-boundaries:
// this repo has two flat trees (src/ registries+helpers, e2e/ specs) and no
// layered architecture to protect — an empty boundary profile would be theatre.
export default tseslint.config(
  {
    ignores: [
      "node_modules/**",
      "test-results/**",
      "playwright-report/**",
      // The gate corpus is plain-JS .mjs; the typed-lint project (tsconfig
      // include) deliberately covers src/** and e2e/** only.
      "scripts/**",
      "**/*.config.{ts,js,mjs}",
      ".proto-forge/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    plugins: { security },
    rules: {
      ...security.configs.recommended.rules,
      // SRP with numbers (NFR-20): same ceilings as the api-node template.
      "max-lines": ["error", { max: 200, skipBlankLines: true, skipComments: true }],
      "max-lines-per-function": ["error", { max: 60, skipBlankLines: true, skipComments: true }],
      complexity: ["error", 8],
      "max-depth": ["error", 3],
      "max-params": ["error", 3],
      // A suite that logs instead of asserting is hiding a missing expect.
      "no-console": "error",
    },
  },
  {
    files: ["e2e/**/*.ts"],
    rules: {
      // A generated spec's registration loop is one "function" to this rule.
      "max-lines-per-function": "off",
    },
  },
);

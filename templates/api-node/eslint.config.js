import js from "@eslint/js";
import tseslint from "typescript-eslint";
import boundaries from "eslint-plugin-boundaries";
import security from "eslint-plugin-security";
import { readFileSync } from "node:fs";

// @adr 005 - the architecture profile is an eslint rule set, selected by derivation
//
// arch:verify re-derives the style from facets.json and fails when the ACTIVE
// profile here disagrees (BR-21). The three profiles share one element vocabulary;
// what changes is which dependency edges are legal. Editing this file to widen an
// edge is a gate edit — the derivation check catches a profile swap, and review
// catches an edge added inside one.
const architecture = JSON.parse(readFileSync(".proto-forge/architecture.json", "utf8"));

const ELEMENTS = [
  { type: "domain", pattern: "src/domain/**" },
  { type: "application", pattern: "src/application/**" },
  { type: "adapter-in", pattern: "src/adapters/in/**" },
  { type: "adapter-out", pattern: "src/adapters/out/**" },
  { type: "platform", pattern: "src/platform/**" },
  { type: "config", pattern: "src/config/**" },
  { type: "main", pattern: "src/main.ts", mode: "file" },
  { type: "harness", pattern: "src/harness/**" },
  { type: "test-infra", pattern: "src/test/**" },
];

// Which element types each element may import from. The domain is framework-pure in
// EVERY profile; the profiles differ in how much the application layer may see and
// whether adapters may lean on each other.
const EDGES = {
  layered: [
    { from: "domain", allow: ["domain"] },
    { from: "application", allow: ["application", "domain", "platform"] },
    { from: "adapter-in", allow: ["adapter-in", "application", "domain", "platform", "config"] },
    { from: "adapter-out", allow: ["adapter-out", "application", "domain", "platform", "config"] },
  ],
  modular: [
    { from: "domain", allow: ["domain"] },
    { from: "application", allow: ["application", "domain", "platform"] },
    { from: "adapter-in", allow: ["adapter-in", "application", "domain", "platform", "config"] },
    { from: "adapter-out", allow: ["adapter-out", "application", "domain", "platform", "config"] },
  ],
  hexagonal: [
    { from: "domain", allow: ["domain"] },
    { from: "application", allow: ["application", "domain", "platform"] },
    // Strict profile: an inbound adapter may not import an outbound one or vice
    // versa — everything crosses through the application's ports.
    { from: "adapter-in", allow: ["application", "domain", "platform", "config"] },
    { from: "adapter-out", allow: ["application", "domain", "platform", "config"] },
  ],
};

const rules = EDGES[architecture.style];
if (rules === undefined) {
  throw new Error(`.proto-forge/architecture.json names unknown style "${architecture.style}"`);
}

export default tseslint.config(
  {
    ignores: [
      "dist/**",
      "coverage/**",
      "node_modules/**",
      ".stryker-tmp/**",
      "scripts/**",
      // The deploy surface, like scripts/**, is gate corpus: deploy:verify and
      // the gates-selftest are its tests, and it shares no app globals.
      "deploy/**",
      // Config files and the .proto-forge reference copies are not app code; the
      // typed-lint project (tsconfig include) deliberately covers src/** only.
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
    plugins: { boundaries, security },
    settings: {
      "boundaries/elements": ELEMENTS,
      "import/resolver": { typescript: true },
    },
    rules: {
      ...security.configs.recommended.rules,
      "boundaries/element-types": [
        "error",
        {
          default: "disallow",
          rules: [
            ...rules,
            { from: "platform", allow: ["platform"] },
            { from: "config", allow: ["config"] },
            { from: "main", allow: ["adapter-in", "adapter-out", "platform", "config", "application", "domain"] },
            { from: "harness", allow: ["harness", "domain", "application"] },
            { from: "test-infra", allow: ["test-infra", "domain", "platform"] },
          ],
        },
      ],
      // SRP with numbers (NFR-20): same ceilings as the web template.
      "max-lines": ["error", { max: 200, skipBlankLines: true, skipComments: true }],
      "max-lines-per-function": ["error", { max: 60, skipBlankLines: true, skipComments: true }],
      complexity: ["error", 8],
      "max-depth": ["error", 3],
      "max-params": ["error", 3],
      // Structured logging only (NFR-12); log:scan repeats this where lint cannot see.
      "no-console": "error",
    },
  },
  {
    files: ["src/**/*.test.ts", "src/test/**", "src/harness/**"],
    rules: {
      "max-lines": "off",
      "max-lines-per-function": "off",
      "@typescript-eslint/no-non-null-assertion": "off",
    },
  },
);

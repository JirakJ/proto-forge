import { expect, report } from "./selftest.mjs";

// The citation gate is what turns "no gaps" from a claim into a build failure.
// Six checks: a citation must resolve, an ADR citation must not cross namespaces,
// a rule must name an enforcer, that enforcer must exist in every template the
// rule's scope covers, a gate must be named by some rule, and a rule's selftest
// case must actually be registered. Templates come from references/templates.json.

const RULE = `### BR-01 — A rule that exists

**MUST.** Something is required.

- **Why:** because.
- **Enforced by:** \`lint\`
- **Proven by:** \`gates:selftest\` → "lint: a case that exists"
`;

const register = (body = RULE) => `# Requirements

## §1 Scope and conformance

Text.

## §10 Rule register

${body}
## §11 The decision table

Text.

## §19 Reconstruction notes

Nothing to report.
`;

const table = `# Decision table (BRS §11)

| # | WHEN | THEN |
| --- | --- | --- |
| T1 | Brief received | Copy the template |
| T10 | Always | A later row |
`;

const REGISTRY = {
  templates: [{ id: "web", dir: "templates/web", kind: "frontend", stack: "ts", notAGate: ["build"] }],
};

const TWO_TEMPLATES = {
  templates: [
    { id: "web", dir: "templates/web", kind: "frontend", stack: "ts", notAGate: ["build"] },
    { id: "api-x", dir: "templates/api-x", kind: "backend", stack: "node", notAGate: [] },
  ],
};

const files = (over = {}) => ({
  "references/requirements.md": register(),
  "references/decision-table.md": table,
  "references/templates.json": REGISTRY,
  "templates/web/package.json": { scripts: { lint: "eslint .", build: "vite build" } },
  "templates/web/scripts/gates-selftest.mjs": 'expect("lint: a case that exists", "x.mjs", {}, { pass: false });\n',
  "SKILL.md": "Applies BR-01 per T1 and BRS §1.\n",
  ...over,
});

expect("citations: resolvable citations pass", "citations.mjs", files(), { pass: true });

expect("citations: a rule citation that resolves to nothing fails", "citations.mjs",
  files({ "SKILL.md": "Applies BR-99.\n" }), { pass: false, matching: /BR-99/ });

expect("citations: a section citation that resolves to nothing fails", "citations.mjs",
  files({ "SKILL.md": "See BRS §42.7.\n" }), { pass: false, matching: /42\.7/ });

expect("citations: a decision-table row that does not exist fails", "citations.mjs",
  files({ "SKILL.md": "Per T9.\n" }), { pass: false, matching: /T9/ });

// The row regex is built from the table itself (range 1..max), so a grown table
// needs no gate edit — the highest row must resolve without touching citations.mjs.
expect("citations: the highest-numbered table row resolves without a gate edit", "citations.mjs",
  files({ "SKILL.md": "Applies BR-01 per T10.\n" }), { pass: true });

// The ADR check applies only where a number can only mean a record: the ADR
// trees. Elsewhere -- SKILL.md, the decision table, gate fixtures -- a number is an
// allocation for a future ADR or a worked example, and enforcing there would demand
// that every future ADR already exist.
expect("citations: an ADR citation resolving to nothing fails", "citations.mjs",
  files({ "templates/web/docs/adr/010-a.md": "# ADR 010: A\n\n- Status: accepted\n\nSupersedes ADR 777.\n" }),
  { pass: false, matching: /777/ });

expect("citations: an ADR citation may not cross namespaces", "citations.mjs",
  files({
    "docs/adr/001-plugin-thing.md": "# ADR 001: A plugin decision\n\n- Status: accepted\n",
    "templates/web/docs/adr/010-a.md": "# ADR 010: A\n\n- Status: accepted\n\nBuilds on ADR 001.\n",
  }), { pass: false, matching: /exists only in the plugin namespace/ });

expect("citations: an annotated cross-namespace citation is allowed", "citations.mjs",
  files({
    "docs/adr/001-plugin-thing.md": "# ADR 001: A plugin decision\n\n- Status: accepted\n",
    "templates/web/docs/adr/010-a.md":
      "# ADR 010: A\n\n- Status: accepted\n\nRecorded in ADR 001 (plugin namespace).\n",
  }), { pass: true });

expect("citations: a number outside the ADR trees is an allocation, not a citation", "citations.mjs",
  files({ "SKILL.md": "Applies BR-01 per T1 and BRS §1. persistence = api emits ADR 023.\n" }),
  { pass: true });

expect("citations: a mention inside §19 is not a citation", "citations.mjs",
  files({
    "references/requirements.md": `${register()}\nBR-03 and BR-04 are cited nowhere.\n`,
  }), { pass: true });

expect("citations: a rule naming no enforcer fails", "citations.mjs",
  files({
    "references/requirements.md": register(`### BR-01 — A rule that exists

**MUST.** Something.

- **Why:** because.
- **Proven by:** \`gates:selftest\` → "lint: a case that exists"
`),
  }), { pass: false, matching: /no enforcer/ });

expect("citations: an enforcer that is not a gate fails", "citations.mjs",
  files({
    "references/requirements.md": register(`### BR-01 — A rule that exists

**MUST.** Something.

- **Why:** because.
- **Enforced by:** \`nonexistent:gate\`
- **Proven by:** \`gates:selftest\` → "lint: a case that exists"
`),
  }), { pass: false, matching: /nonexistent:gate/ });

expect("citations: a gate no rule names fails", "citations.mjs",
  files({
    "templates/web/package.json": { scripts: { lint: "eslint .", "orphan:scan": "node scripts/orphan.mjs" } },
  }), { pass: false, matching: /orphan:scan/ });

expect("citations: a rule with no selftest case fails", "citations.mjs",
  files({
    "references/requirements.md": register(`### BR-01 — A rule that exists

**MUST.** Something.

- **Why:** because.
- **Enforced by:** \`lint\`
`),
  }), { pass: false, matching: /no selftest/ });

expect("citations: a selftest case the suite never registers fails", "citations.mjs",
  files({ "templates/web/scripts/gates-selftest.mjs": 'expect("lint: a different case", "x.mjs", {}, { pass: false });\n' }),
  { pass: false, matching: /a case that exists/ });

// --- the template registry and rule scopes -------------------------------------
// One rule, N templates: the Scope bullet names which templates a rule binds, and
// check 4 demands the enforcer in EVERY one of them — identical gate names across
// stacks are forced by the gate, not by convention.

const backendRule = (enforced, scope = "backend") => register(`### BR-01 — A rule that exists

**MUST.** Something is required.

- **Why:** because.
- **Scope:** ${scope}
- **Enforced by:** \`${enforced}\`
- **Proven by:** \`gates:selftest\` → "lint: a case that exists"
`);

const twoTemplates = (over = {}) => files({
  "references/templates.json": TWO_TEMPLATES,
  "templates/api-x/package.json": { scripts: { lint: "eslint ." } },
  "templates/api-x/scripts/gates-selftest.mjs": 'expect("lint: a case that exists", "x.mjs", {}, { pass: false });\n',
  // The web-scoped default rule (RULE) covers web's lint; api-x's lint needs its own
  // norm, which the backend-scoped rule in each case below provides — or fails to.
  ...over,
});

const WEB_AND_BACKEND_RULES = register(`${RULE}
### BR-02 — A backend rule

**MUST.** Something backend.

- **Why:** because.
- **Scope:** backend
- **Enforced by:** \`lint\`
- **Proven by:** \`gates:selftest\` → "lint: a case that exists"
`);

expect("citations: a backend-scoped rule whose enforcer exists everywhere passes", "citations.mjs",
  twoTemplates({ "references/requirements.md": WEB_AND_BACKEND_RULES, "SKILL.md": "Applies BR-01 and BR-02 per T1 and BRS §1.\n" }),
  { pass: true });

expect("citations: a scoped rule naming a gate a covered template lacks fails", "citations.mjs",
  twoTemplates({
    "references/requirements.md": backendRule("i18n:verify"),
    "templates/web/package.json": { scripts: { lint: "eslint .", "i18n:verify": "node x.mjs" } },
  }), { pass: false, matching: /api-x/ });

expect("citations: a gate with no rule covering ITS template fails", "citations.mjs",
  twoTemplates({
    // web-scoped rule names lint; api-x has lint too, but no backend/all-scoped rule names it.
    "templates/api-x/package.json": { scripts: { lint: "eslint .", "arch:verify": "node arch.mjs" } },
  }), { pass: false, matching: /arch:verify/ });

expect("citations: an unknown scope token fails", "citations.mjs",
  files({ "references/requirements.md": backendRule("lint", "mobile") }),
  { pass: false, matching: /mobile/ });

expect("citations: a registry entry without a package.json fails", "citations.mjs",
  files({ "references/templates.json": TWO_TEMPLATES }),
  { pass: false, matching: /api-x/ });

// A parenthetical after an enforcer narrows it to a subset of the rule's scope:
// an all-scoped rule may name a web-only gate `(web)` without demanding it in
// backend templates — while prose parentheticals narrow nothing.
expect("citations: a restricted enforcer is not demanded outside its restriction", "citations.mjs",
  twoTemplates({
    "references/requirements.md": register(`### BR-01 — A rule that exists

**MUST.** Something is required.

- **Why:** because.
- **Scope:** all
- **Enforced by:** \`lint\`, \`layer:scan\` (web)
- **Proven by:** \`gates:selftest\` → "lint: a case that exists", "web: a web case" (web)
`),
    "templates/web/package.json": { scripts: { lint: "eslint .", "layer:scan": "node x.mjs" } },
    "templates/web/scripts/gates-selftest.mjs":
      'expect("lint: a case that exists", "x.mjs", {}, { pass: false });\nexpect("web: a web case", "x.mjs", {}, { pass: false });\n',
  }), { pass: true });

expect("citations: a prose parenthetical after an enforcer narrows nothing", "citations.mjs",
  twoTemplates({
    "references/requirements.md": register(`### BR-01 — A rule that exists

**MUST.** Something is required.

- **Why:** because.
- **Scope:** all
- **Enforced by:** \`missing:gate\` (the gate that should exist everywhere)
- **Proven by:** \`gates:selftest\` → "lint: a case that exists"
`),
  }), { pass: false, matching: /missing:gate/ });

report();

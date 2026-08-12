import { expect, report } from "./selftest.mjs";

// The citation gate is what turns "no gaps" from a claim into a build failure.
// Six checks: a citation must resolve, an ADR citation must not cross namespaces,
// a rule must name an enforcer, that enforcer must exist, a gate must be named by
// some rule, and a rule's selftest case must actually be registered.

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
`;

const files = (over = {}) => ({
  "references/requirements.md": register(),
  "references/decision-table.md": table,
  "template/package.json": { scripts: { lint: "eslint .", build: "vite build" } },
  "template/scripts/gates-selftest.mjs": 'expect("lint: a case that exists", "x.mjs", {}, { pass: false });\n',
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

// The ADR check applies only where a number can only mean a record: the two ADR
// trees. Elsewhere -- SKILL.md, the decision table, gate fixtures -- a number is an
// allocation for a future ADR or a worked example, and enforcing there would demand
// that every future ADR already exist.
expect("citations: an ADR citation resolving to nothing fails", "citations.mjs",
  files({ "template/docs/adr/010-a.md": "# ADR 010: A\n\n- Status: accepted\n\nSupersedes ADR 777.\n" }),
  { pass: false, matching: /777/ });

expect("citations: an ADR citation may not cross namespaces", "citations.mjs",
  files({
    "docs/adr/001-plugin-thing.md": "# ADR 001: A plugin decision\n\n- Status: accepted\n",
    "template/docs/adr/010-a.md": "# ADR 010: A\n\n- Status: accepted\n\nBuilds on ADR 001.\n",
  }), { pass: false, matching: /exists only in the other ADR namespace/ });

expect("citations: an annotated cross-namespace citation is allowed", "citations.mjs",
  files({
    "docs/adr/001-plugin-thing.md": "# ADR 001: A plugin decision\n\n- Status: accepted\n",
    "template/docs/adr/010-a.md":
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
  }), { pass: false, matching: /not a gate/ });

expect("citations: a gate no rule names fails", "citations.mjs",
  files({
    "template/package.json": { scripts: { lint: "eslint .", "orphan:scan": "node scripts/orphan.mjs" } },
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
  files({ "template/scripts/gates-selftest.mjs": 'expect("lint: a different case", "x.mjs", {}, { pass: false });\n' }),
  { pass: false, matching: /a case that exists/ });

report();

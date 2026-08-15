import { expect, report } from "./selftest.mjs";

// Proves the elicitation gate (skills/elicit/template/.elicit/lint.mjs) rejects
// what ADR 012 claims it does. The cases walk the failure modes that turn
// elicitation back into a form: a draft that looks finished, a diagnostic that
// returns nothing, a voice prompt with two questions, an interview guide that
// could be sent, and a document that is mostly questions.

const LINT = "../skills/elicit/template/.elicit/lint.mjs";

const gap = (n) =>
  `> **Gap G${n} — provisional.** We assume something that may well be wrong, and this is what changes if it is.\n\n`;

const draft = (gaps, extra = "") => `---
mode: artifact
stage: cold
gaps: ${gaps}
---

# A two-day workshop

## What this achieves

Developers stop using the assistant as autocomplete and start using it where it
changes the cost of the work, on their own codebase rather than a sample.

## Shape

Day one covers where it already pays. Day two covers where it lies and how the
team notices before review.

## Deliberately open

${Array.from({ length: gaps }, (_, i) => gap(i + 1)).join("")}## What this leaves out on purpose

No tooling comparison and no model selection: both age badly, the habits do not.
${extra}`;

const bridge = (over = {}) => ({
  version: 1,
  audience: "A CTO with no prior relationship",
  stage: "cold",
  artifacts: [
    { id: "A1", mode: "artifact", stage: "cold", doc: "docs/d/README.md", gaps: 3, reason: "usefully wrong beats unwritten" },
  ],
  findings: [],
  ...over,
});

const project = (over = {}, docs = { "docs/d/README.md": draft(3) }) => ({
  "elicitation.json": bridge(over),
  ...docs,
});

expect("elicit: a visibly unfinished draft passes", LINT, project(), { pass: true, args: ["."] });

expect(
  "elicit: a draft that looks finished fails — it sells your idea and drowns theirs",
  LINT,
  project(
    { artifacts: [{ id: "A1", mode: "artifact", stage: "cold", doc: "docs/d/README.md", gaps: 1, reason: "r" }] },
    { "docs/d/README.md": draft(1) },
  ),
  { pass: false, matching: /the floor is 3/, args: ["."] },
);

expect(
  "elicit: a draft carrying commercial language fails — arguing stops collecting",
  LINT,
  project({}, { "docs/d/README.md": draft(3, "\nOur pricing starts at a day rate; sign here to confirm.\n") }),
  { pass: false, matching: /commercial language/, args: ["."] },
);

expect(
  "elicit: a gap count that disagrees with the document fails",
  LINT,
  project({ artifacts: [{ id: "A1", mode: "artifact", stage: "cold", doc: "docs/d/README.md", gaps: 9, reason: "r" }] }),
  { pass: false, matching: /gaps says 9/, args: ["."] },
);

const DIAG = `---
mode: diagnostic
stage: cold
questions: 6
findings: 1
---

# Where you stand

## What we looked at

A survey run over the repository, plus the answers given.

## Findings

The table below states what is true and what typical looks like beside it.

## What we still need

Six questions follow, each stating why it matters.
`;

expect(
  "elicit: a diagnostic that returns findings with benchmarks passes",
  LINT,
  project(
    {
      artifacts: [{ id: "A1", mode: "diagnostic", stage: "cold", doc: "docs/d/README.md", questions: 6, reason: "cold lead" }],
      findings: [{ artifact: "A1", id: "F1", benchmark: "typical is under ten minutes", evidence: "survey:C3" }],
    },
    { "docs/d/README.md": DIAG },
  ),
  { pass: true, args: ["."] },
);

expect(
  "elicit: a diagnostic that returns nothing is a form with better manners",
  LINT,
  project(
    { artifacts: [{ id: "A1", mode: "diagnostic", stage: "cold", doc: "docs/d/README.md", questions: 6, reason: "r" }] },
    { "docs/d/README.md": DIAG },
  ),
  { pass: false, matching: /form with better manners/, args: ["."] },
);

expect(
  "elicit: a finding without a benchmark fails",
  LINT,
  project(
    {
      artifacts: [{ id: "A1", mode: "diagnostic", stage: "cold", doc: "docs/d/README.md", questions: 6, reason: "r" }],
      findings: [{ artifact: "A1", id: "F1", evidence: "survey:C3" }],
    },
    { "docs/d/README.md": DIAG },
  ),
  { pass: false, matching: /no benchmark/, args: ["."] },
);

expect(
  "elicit: a diagnostic past eight questions fails",
  LINT,
  project(
    {
      artifacts: [{ id: "A1", mode: "diagnostic", stage: "cold", doc: "docs/d/README.md", questions: 14, reason: "r" }],
      findings: [{ artifact: "A1", id: "F1", benchmark: "b", evidence: "survey:C3" }],
    },
    { "docs/d/README.md": DIAG },
  ),
  { pass: false, matching: /completion falls faster/, args: ["."] },
);

const VOICE = `---
mode: voice
stage: cold
question: 1
---

# One question, three minutes

Walk me through the last time this actually bit you.

The recording link is below and there is no text field anywhere.
`;

expect(
  "elicit: two questions in a voice prompt is already a form",
  LINT,
  project(
    { artifacts: [{ id: "A1", mode: "voice", stage: "cold", doc: "docs/d/README.md", questions: 2, reason: "r" }] },
    { "docs/d/README.md": VOICE },
  ),
  { pass: false, matching: /asks exactly one question/, args: ["."] },
);

expect(
  "elicit: an interview guide that does not say it is internal fails",
  LINT,
  project(
    { artifacts: [{ id: "A1", mode: "interview", stage: "qualified", doc: "docs/d/README.md", reason: "r" }] },
    {
      "docs/d/README.md":
        "---\nmode: interview\nstage: qualified\nminutes: 30\n---\n\n# Guide\n\nSituation, problem, implication, need-payoff, then the extraction target.\n",
    },
  ),
  { pass: false, matching: /not for sending/, args: ["."] },
);

expect(
  "elicit: a document that is mostly questions is a form whatever it is called",
  LINT,
  project(
    { artifacts: [{ id: "A1", mode: "artifact", stage: "cold", doc: "docs/d/README.md", gaps: 3, reason: "r" }] },
    {
      "docs/d/README.md":
        "---\nmode: artifact\nstage: cold\ngaps: 3\n---\n\nWhat is your goal?\nWho is the audience?\nWhat is the deadline?\nWhat is the budget?\nWhich tools?\n",
    },
  ),
  { pass: false, matching: /that is a form regardless/, args: ["."] },
);

expect(
  "elicit: an instrument with no stated reason fails — the choice IS the decision",
  LINT,
  project({ artifacts: [{ id: "A1", mode: "artifact", stage: "cold", doc: "docs/d/README.md", gaps: 3 }] }),
  { pass: false, matching: /states no reason/, args: ["."] },
);

expect(
  "elicit: two instruments in one document fails",
  LINT,
  project({
    artifacts: [
      { id: "A1", mode: "artifact", stage: "cold", doc: "docs/d/README.md", gaps: 3, reason: "r" },
      { id: "A2", mode: "voice", stage: "cold", doc: "docs/d/README.md", questions: 1, reason: "r" },
    ],
  }),
  { pass: false, matching: /one document is one instrument/, args: ["."] },
);

report("elicit-lint");

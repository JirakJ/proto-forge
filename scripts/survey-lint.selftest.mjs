import { expect, report } from "./selftest.mjs";

// Proves the survey gate (skills/survey/template/.survey/lint.mjs) rejects what
// ADR 011 claims it does. The lint is standalone by design — copied per run next
// to the system being surveyed — so it is exercised here exactly as it runs
// there: spawned against a throwaway survey directory, argv[2] = the target.
//
// The cases walk the properties a survey's value rests on: a claim nobody can
// point at, a row that hides whether it was read or inferred, a question id the
// discovery taxonomy does not define, a count typed rather than derived, and a
// skip nobody declared.

const LINT = "../skills/survey/template/.survey/lint.mjs";

const DOC = `---
area: api-notes
kind: api-area
commit: 0000000000000000000000000000000000000000
capabilities: 1
unknowns: 1
---

# api-notes — the notes resource

## Capabilities

| # | Capability | Evidence | Confidence |
| --- | --- | --- | --- |
| C1 | Lists every note | \`src/routes/notes.ts:14\` | observed |

## Unknowns

| # | Topic | Evidence of absence | Question |
| --- | --- | --- | --- |
| U1 | No error contract | no error handler is registered | Q16 |

## Coverage

node_modules skipped as a dependency directory.
`;

const bridge = (over = {}) => ({
  version: 1,
  commit: "0000000000000000000000000000000000000000",
  sources: [{ path: "src/routes/notes.ts", sha256: "a".repeat(64) }],
  skipped: [{ path: "node_modules", reason: "dependency directory" }],
  areas: [{ id: "api-notes", kind: "api-area", doc: "docs/api-notes/README.md", capabilities: 1, unknowns: 1 }],
  capabilities: [
    { area: "api-notes", id: "C1", capability: "Lists every note", evidence: "src/routes/notes.ts:14", confidence: "observed" },
  ],
  unknowns: [
    { area: "api-notes", id: "U1", topic: "No error contract", evidence: "no error handler is registered", q: "Q16" },
  ],
  ...over,
});

const project = (over = {}, docs = { "docs/api-notes/README.md": DOC }) => ({
  "survey.json": bridge(over),
  ...docs,
});

expect("survey: a complete survey passes", LINT, project(), { pass: true, args: ["."] });

expect(
  "survey: a capability nobody can point at fails",
  LINT,
  project({
    capabilities: [
      { area: "api-notes", id: "C1", capability: "Lists every note", evidence: "somewhere in the routes", confidence: "observed" },
    ],
  }),
  { pass: false, matching: /is not path:line/, args: ["."] },
);

expect(
  "survey: a row that does not say whether it was read or inferred fails",
  LINT,
  project({
    capabilities: [
      { area: "api-notes", id: "C1", capability: "Lists every note", evidence: "src/routes/notes.ts:14", confidence: "probably" },
    ],
  }),
  { pass: false, matching: /observed\|inferred/, args: ["."] },
);

expect(
  "survey: an unknown pointing at a question the taxonomy does not define fails",
  LINT,
  project({
    unknowns: [{ area: "api-notes", id: "U1", topic: "No error contract", evidence: "none registered", q: "Q99" }],
  }),
  { pass: false, matching: /not a discovery question id/, args: ["."] },
);

// An unknown outside the taxonomy is legal — visible and countable beats tidy —
// so `q: null` must PASS where an invented id fails.
expect(
  "survey: an unknown outside the taxonomy is legal as null",
  LINT,
  project({
    unknowns: [{ area: "api-notes", id: "U1", topic: "Something the taxonomy misses", evidence: "no file states it", q: null }],
  }),
  { pass: true, args: ["."] },
);

expect(
  "survey: a count typed rather than derived fails",
  LINT,
  project({ areas: [{ id: "api-notes", kind: "api-area", doc: "docs/api-notes/README.md", capabilities: 9, unknowns: 1 }] }),
  { pass: false, matching: /capabilities says 9/, args: ["."] },
);

expect(
  "survey: an undeclared skip fails — coverage is stated, never implied",
  LINT,
  project({ skipped: [] }),
  { pass: false, matching: /different sentences/, args: ["."] },
);

expect(
  "survey: a survey that cannot name the commit it read fails",
  LINT,
  project({ commit: "" }),
  { pass: false, matching: /cannot name what it read/, args: ["."] },
);

expect(
  "survey: an area whose document does not exist fails",
  LINT,
  project({}, {}),
  { pass: false, matching: /does not exist/, args: ["."] },
);

expect(
  "survey: an orphan document nothing declares fails",
  LINT,
  project({}, { "docs/api-notes/README.md": DOC, "docs/api-ghosts/README.md": DOC }),
  { pass: false, matching: /orphan document/, args: ["."] },
);

expect(
  "survey: a source pinned without a sha256 fails",
  LINT,
  project({ sources: [{ path: "src/routes/notes.ts" }] }),
  { pass: false, matching: /not a pin/, args: ["."] },
);

expect(
  "survey: a document missing a pinned section fails",
  LINT,
  project({}, { "docs/api-notes/README.md": DOC.replace("## Unknowns", "## Open items") }),
  { pass: false, matching: /pinned "## Unknowns" section/, args: ["."] },
);

report("survey-lint");
